// /* global artifacts web3 */
const fs = require('fs');
const ethabi = require('ethereumjs-abi');

const Registry = artifacts.require('Registry.sol');
const Token = artifacts.require('EIP20.sol');
const Voting = artifacts.require('PLCRVoting.sol');

const config = JSON.parse(fs.readFileSync('../conf/config.json'));
const paramConfig = config.paramDefaults;
console.log(config)

module.exports = (done) => {
  async function applyVoteReveal(networkID) {

    const tokenAddress = '0x65f61ededbb580fa6742daa4d2c36106956e6e5e'
    const votingAddress = '0x07ceb746e9bd3cc7611e3a9fd977c1d11c3ce877'
    const registryAddress = '0x6362fa7cb4996c0c24436a03637ccd54038de6c1'

    const tokenProxy = await Token.at(tokenAddress)
    const votingProxy = await Voting.at(votingAddress)
    const registryProxy = await Registry.at(registryAddress)

    let pollIds = []

    // allow registry to spend token for token holders
    for (let i=0; i<config.token.tokenHolders.length; i++) {
      let rcpt = await tokenProxy.approve(registryAddress, 100, {from: config.token.tokenHolders[i]})
      console.log('rcpt', rcpt.logs[0].args)
      let rcpt2 = await tokenProxy.approve(votingAddress, 100, {from: config.token.tokenHolders[i]})
      console.log('rcpt2', rcpt2.logs[0].args)
      let rcpt3 = await votingProxy.requestVotingRights(100, {from: config.token.tokenHolders[i]})
      console.log('rcpt3', rcpt3.logs[0].args)

      let balance = await tokenProxy.balanceOf(config.token.tokenHolders[i])
      console.log('balance', balance / 1e18)
    }
    // apply for listing
    for (let i=0; i<config.token.tokenHolders.length; i++) {
      for (let j=0; j<10; j++) {

        let id = (i*10)+j
        let hash = web3.sha3(id.toString())
        console.log(id, hash, await registryProxy.isWhitelisted(hash), await registryProxy.appWasMade(hash))
        let regRcpt = await registryProxy.apply(hash, 1, id.toString(), {from: config.token.tokenHolders[i]})
        // console.log('regRcpt', regRcpt)
        let pollRcpt = await registryProxy.challenge(hash, id.toString(), {from: config.token.tokenHolders[i]})
        console.log('pollRcpt', pollRcpt.logs[0].args)

        let challengeId = pollRcpt.logs[0].args.challengeID.toNumber()
        console.log('challengeId', challengeId)

        pollIds.push(challengeId)
      }
    }

    // start voting
    for (let i=0; i<100; i++) {
      for (let j=0; j<config.token.tokenHolders.length; j++) {
        console.log(pollIds[i])
        // let hash = web3.sha3((j%2).toString(), {encoding: "hex"})
        // requires sha3 that hashes the same as solidity
        let hash = '0x' + ethabi.soliditySHA3(['uint', 'uint'], [(j%2), 0]).toString('hex')
        console.log(hash)
        let receipt = await votingProxy.commitVote(pollIds[i], hash, 1, 0, {from: config.token.tokenHolders[j]})
        // console.log('commitVote', receipt)
      }
    }

    // fast forward to end commit period
    web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [config.paramDefaults.commitStageLength], id: 0})
    web3.currentProvider.send({jsonrpc: "2.0", method: "evm_mine", params: [], id: 0})

    // start revealing
    for (let i=0; i<100; i++) {
      for (let j=0; j<config.token.tokenHolders.length; j++) {
        console.log(pollIds[i], await votingProxy.revealPeriodActive(pollIds[i], {from: config.token.tokenHolders[j]}))
        let receipt = await votingProxy.revealVote(pollIds[i], j%2, 0, {from: config.token.tokenHolders[j]})
        console.log('revealVote', receipt)
      }
    }
  
    return true;
  }

  // web3 requires callback syntax. silly!
  web3.version.getNetwork((err, network) => {
    if (err) {
      return done(err); // truffle exec exits if an error gets returned
    }
    return applyVoteReveal(network).then(() => done());
  });
};
