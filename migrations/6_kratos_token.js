/* global artifacts */

const KratosToken = artifacts.require('KratosToken.sol');

module.exports = (deployer) => {

  return deployer.deploy(KratosToken, '1000000000000000000000000000');
};
