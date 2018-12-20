  /* global artifacts web3 */
const fs = require('fs');
const BN = require('bignumber.js');
const ethabi = require('ethereumjs-abi');

const RegistryFactory = artifacts.require('RegistryFactory.sol');
const Registry = artifacts.require('Registry.sol');
const Token = artifacts.require('KratosToken.sol');
const Voting = artifacts.require('PLCRVoting.sol');

const config = JSON.parse(fs.readFileSync('../conf/config.json'));
console.log(config)
// override with accounts from own node
config.token.tokenHolders = web3.eth.accounts.slice(0, 10)
const paramConfig = config.paramDefaults;

module.exports = (done) => {
  async function deployProxies(networkID) {
    let registryFactoryAddress;
    if (networkID === '1') {
      registryFactoryAddress = '0xcc0df91b86795f21c3d43dbeb3ede0dfcf8dccaf'; // mainnet
    } else if (networkID === '4') {
      registryFactoryAddress = '0x2bddfc0c506a00ea3a6ccea5fbbda8843377dcb1'; // rinkeby
    } else {
      registryFactoryAddress = RegistryFactory.address; // development
    }

    /* eslint-disable no-console */
    console.log('Using RegistryFactory at:');
    console.log(`     ${registryFactoryAddress}`);
    console.log('');
    console.log('Deploying proxy contracts...');
    console.log('...');
    /* eslint-enable no-console */

    const registryFactory = await RegistryFactory.at(registryFactoryAddress);

    const registryReceipt = await registryFactory.newRegistryBYOToken(
      Token.address,
      [
        paramConfig.minDeposit,
        paramConfig.pMinDeposit,
        paramConfig.applyStageLength,
        paramConfig.pApplyStageLength,
        paramConfig.commitStageLength,
        paramConfig.pCommitStageLength,
        paramConfig.revealStageLength,
        paramConfig.pRevealStageLength,
        paramConfig.dispensationPct,
        paramConfig.pDispensationPct,
        paramConfig.voteQuorum,
        paramConfig.pVoteQuorum,
        paramConfig.exitTimeDelay,
        paramConfig.exitPeriodLen,
      ],
      config.name,
    )
    // const registryReceipt = await registryFactory.newRegistryWithToken(
    //   config.token.supply,
    //   config.token.name,
    //   config.token.decimals,
    //   config.token.symbol,
    //   [
    //     paramConfig.minDeposit,
    //     paramConfig.pMinDeposit,
    //     paramConfig.applyStageLength,
    //     paramConfig.pApplyStageLength,
    //     paramConfig.commitStageLength,
    //     paramConfig.pCommitStageLength,
    //     paramConfig.revealStageLength,
    //     paramConfig.pRevealStageLength,
    //     paramConfig.dispensationPct,
    //     paramConfig.pDispensationPct,
    //     paramConfig.voteQuorum,
    //     paramConfig.pVoteQuorum,
    //     paramConfig.exitTimeDelay,
    //     paramConfig.exitPeriodLen,
    //   ],
    //   config.name,
    // );
console.log(registryReceipt.logs)
    const {
      token,
      plcr,
      parameterizer,
      registry,
    } = registryReceipt.logs[0].args;

    const tokenProxy = await Token.at(token);
    const registryProxy = await Registry.at(registry);
    const registryName = await registryProxy.name.call();

    // START :: this section is more for testing. 
    if (networkID > 999) {
      console.log(await tokenProxy.totalSupply.call())

      // don't do auto distribution on mainnet
      if (networkID > 1) {
        const evenTokenDispensation = new BN(await tokenProxy.totalSupply.call()).div(config.token.tokenHolders.length).toString();
        console.log(`Dispensing ${config.token.supply} tokens evenly to ${config.token.tokenHolders.length} addresses:`);

        let result = await Promise.all(config.token.tokenHolders.map(async (account) => {
          console.log(`Transferring tokens to address: ${account}`);
          return tokenProxy.transfer(account, evenTokenDispensation);
        }));
        console.log('result')
        /* eslint-enable no-console */
      }
      await applyVoteReveal(token, plcr, registry)
    }
    // END :: section ends

    /* eslint-disable no-console */
    console.log(`Proxy contracts successfully migrated to network_id: ${networkID}`);
    console.log('');
    console.log(`${config.token.name} (ERC20):`);
    console.log(`     ${token}`);
    console.log('PLCRVoting:');
    console.log(`     ${plcr}`);
    console.log('Parameterizer:');
    console.log(`     ${parameterizer}`);
    console.log(`${registryName} (Registry):`);
    console.log(`     ${registry}`);
    console.log('');

    return true;
  }

  async function applyVoteReveal(tokenAddress, votingAddress, registryAddress) {

    console.log(tokenAddress)
    console.log(votingAddress)
    console.log(registryAddress)

    const tokenProxy = await Token.at(tokenAddress)
    const votingProxy = await Voting.at(votingAddress)
    const registryProxy = await Registry.at(registryAddress)

    let pollIds = []

    const appPerHolder = 1
    const totalApp = appPerHolder * config.token.tokenHolders.length

    // allow registry to spend token for token holders
    for (let i=0; i<config.token.tokenHolders.length; i++) {

      console.log('start', i, config.token.tokenHolders[i])

      let balance = await tokenProxy.balanceOf(config.token.tokenHolders[i])
      console.log('balance', balance / 1e18)

      let rcpt = await tokenProxy.approve(registryAddress, 100, {from: config.token.tokenHolders[i]})
      console.log('rcpt', rcpt.logs[0].args)
      let rcpt2 = await tokenProxy.approve(votingAddress, 100, {from: config.token.tokenHolders[i]})
      console.log('rcpt2', rcpt2.logs[0].args)
      let rcpt3 = await votingProxy.requestVotingRights(100, {from: config.token.tokenHolders[i]})
      console.log('rcpt3', rcpt3.logs[0].args)
    }
    // apply for listing
    for (let i=0; i<config.token.tokenHolders.length; i++) {
      for (let j=0; j<appPerHolder; j++) {

        console.log(i, j)

        let id = (i*appPerHolder)+j
        let hash = web3.sha3(id.toString())
        console.log(id, hash, await registryProxy.isWhitelisted(hash), await registryProxy.appWasMade(hash))
        let regRcpt = await registryProxy.apply(hash, config.paramDefaults.minDeposit, id.toString(), {from: config.token.tokenHolders[i]})
        // console.log('regRcpt', regRcpt)
        let pollRcpt = await registryProxy.challenge(hash, id.toString(), {from: config.token.tokenHolders[i]})
        console.log('pollRcpt', pollRcpt.logs[0].args)

        let challengeId = pollRcpt.logs[0].args.challengeID.toNumber()
        console.log('challengeId', challengeId)

        pollIds.push(challengeId)

        // allow all tokenHolders to vote
        await votingProxy.allowVoters(challengeId, config.token.tokenHolders)
      }
    }

    // // start voting
    // for (let i=0; i<totalApp; i++) {
    //   for (let j=0; j<config.token.tokenHolders.length; j++) {
    //     console.log('vote', pollIds[i])
    //     // let hash = web3.sha3((j%2).toString(), {encoding: "hex"})
    //     // requires sha3 that hashes the same as solidity
    //     let hash = '0x' + ethabi.soliditySHA3(['uint', 'uint'], [(j%2), 0]).toString('hex')
    //     console.log(pollIds[i], typeof(pollIds[i]))
    //     console.log(j, config.token.tokenHolders[j], typeof(config.token.tokenHolders[j]))
    //     let receipt = await votingProxy.commitVote(pollIds[i], hash, config.paramDefaults.minDeposit, 0, {from: config.token.tokenHolders[j]})
    //     // console.log('commitVote', receipt)
    //   }
    // }

    // // fast forward to end commit period
    // web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [config.paramDefaults.commitStageLength], id: 0})
    // web3.currentProvider.send({jsonrpc: "2.0", method: "evm_mine", params: [], id: 0})

    // // start revealing
    // for (let i=0; i<totalApp; i++) {
    //   for (let j=0; j<config.token.tokenHolders.length; j++) {
    //     console.log('reveal', pollIds[i], await votingProxy.revealPeriodActive(pollIds[i], {from: config.token.tokenHolders[j]}))
    //     let receipt = await votingProxy.revealVote(pollIds[i], j%2, 0, {from: config.token.tokenHolders[j]})
    //   }
    // }

    // // fast forward to end reveal period
    // web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [config.paramDefaults.revealStageLength], id: 0})
    // web3.currentProvider.send({jsonrpc: "2.0", method: "evm_mine", params: [], id: 0})

    // // resolve challenge
    // for (let i=0; i<totalApp; i++) {
    //   console.log('resolve', i)
    //   let hash = web3.sha3(i.toString())
    //   console.log(i, hash, await registryProxy.challengeExists(hash), await registryProxy.challengeCanBeResolved(hash))
    //   let receipt = await registryProxy.updateStatus(hash)
    // }

    // // start claiming
    // for (let i=0; i<totalApp; i++) {
    //   for (let j=0; j<config.token.tokenHolders.length; j++) {
    //     console.log('claim', pollIds[i])
    //     console.log(await votingProxy.pollEnded(pollIds[i]))
    //     try {
    //       console.log(await votingProxy.getNumPassingTokens(config.token.tokenHolders[j], pollIds[i]))
    //       let receipt = await registryProxy.claimReward(pollIds[i], {from: config.token.tokenHolders[j]})
    //       console.log(receipt)
    //     } catch (error) {
    //       console.log(error)
    //     }
    //   }
    // }
    
    return true;
  }

  // web3 requires callback syntax. silly!
  web3.version.getNetwork((err, network) => {
    if (err) {
      return done(err); // truffle exec exits if an error gets returned
    }
    
    return deployProxies(network).then(() => done());
  });
};
