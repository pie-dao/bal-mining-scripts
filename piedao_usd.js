const Web3 = require('web3');
const BigNumber = require('bignumber.js');
const cliProgress = require('cli-progress');
const fs = require('fs');
const { argv } = require('yargs');

const utils = require('./utils');
const poolAbi = require('./abi/BPool.json');
const tokenAbi = require('./abi/BToken.json');

const web3 = new Web3(
    new Web3.providers.WebsocketProvider(
        `wss://mainnet.infura.io/ws/v3/e106b2b27c0f4941be1f2c183a20b3ea`
    )
);

BigNumber.config({
    EXPONENTIAL_AT: [-100, 100],
    ROUNDING_MODE: BigNumber.ROUND_DOWN,
    DECIMAL_PLACES: 18,
});

function bnum(val) {
    return new BigNumber(val.toString());
}

const usd_holders = [
    '0x302abcedf32b8534970a70c21eb848fc9af19f31',
    '0x7d2f4bcb767eb190aed0f10713fe4d9c07079ee8',
    '0x2e4de42f0b8ac51d435bd98121af106388d911bd',
    '0xe1b86131bc69d0237f7243542cb9156fa8f034a8',
    '0xfad4a1f91026e62774a918202572b9be2fdcdb4e',
    '0xc50eaaee441566b4ef4f1e3270d19f24223cddf4',
    '0xc5417a0fe9a7f41864fddfd639980f58fa511cc4',
    '0x42d13efa958586ff2d3ec20956d44dad8da55864',
    '0x7570d3a456e659ab7d475db30a26745e67d6a97b',
    '0x33669137fc9259e547c73d8c15870caed024b8f4',
    '0x20c75587792bd5bfbe96abb680e9faea5b3edd9f',
    '0x0554a200988cf265b3aa35436a903d51fac47112',
    '0xd68a5ccde1e5273c79cd40711fe4750122cdd865',
    '0x80bb0d87dce1a94329586ce9c7d39692bbf44af6',
    '0x49739691fb5f3992b3f2536f309d955558e75933',
    '0xa698cade532bf7491f0f887284f8e10e2de97198',
    '0x4594ab61b53142dafe3a0762cca6ac00d6cf71f3',
    '0x4f5f10ad90d3cb4b1be5fa9d3fae507ecf57ddd8',
    '0x17102711723d3cc400b876173ce205f71ec6c04a',
    '0xfd6d004e713e809292007c4f70daf12894a2b394',
    '0x17ff301124080fb84bec04b9567b49fa4e43ef23',
    '0x3aa60a199f776ec726560d6d1edeac7c2f85072c',
    '0x48a9f30c4b619aed265e145666abe572a1b27305',
    '0x17a791d8e241d4be11a59f7073b3122bb019facd',
    '0x2983a89e018bae9e3eec745cced1be85a59c44c4',
    '0xbd1f7d88c76a86c60d41bddd4819fae404e7151e',
    '0x3548fbc04fc033e07e8004904d18fad502f4f307',
    '0x486eaab71360a0e7bade22509a86815b1a2eada2',
    '0x1ee10aeaebc6336b813daf9067248fa90de2b589',
    '0xac39d821bfdc12d2aacea2a940738b96b38d1a75',
    '0xd18a54f89603fe4301b29ef6a8ab11b9ba24f139',
    '0xc1c73fe851dc103b2662a9b80e5a1c681801cc9d',
    '0x5d58518c1902ed78c48d77ebe71feede67419438',
    '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
    '0x5398850a9399da87624874704feaa8a9c6c4089b',
    '0xc31db2e710192791b65de43d4b84886a6d770322',
    '0xeeff6fd32deafe1a9d3258a51c7f952f9ff0b2ce',
    '0x434ded09939b64cd76baa81f9a394283d4c71f05',
];

const usd_address = '0x9a48bd0ec040ea4f1d3147c025cd4076a2e71e3e';
const week_3 = bnum(209.124919643329);

if (!argv.startBlock || !argv.endBlock || !argv.week) {
    console.log(
        'Usage: node piedao_usd.js --week 3 --startBlock 10221819 --endBlock 10312236'
    );
    process.exit();
}

const END_BLOCK = argv.endBlock; // Closest block to reference time at end of week
const START_BLOCK = argv.startBlock; // Closest block to reference time at beginning of week
const WEEK = argv.week; // Week for mining distributions. Ex: 1

const BAL_PER_WEEK = week_3;
const BLOCKS_PER_SNAPSHOT = 64;
const BAL_PER_SNAPSHOT = BAL_PER_WEEK.div(
    bnum(Math.ceil((END_BLOCK - START_BLOCK) / 64))
); // Ceiling because it includes end block

async function getRewardsAtBlock(i) {
    let block = await web3.eth.getBlock(i);
    let bPool = new web3.eth.Contract(poolAbi, usd_address);

    let bptSupplyWei = await bPool.methods.totalSupply().call(undefined, i);
    let bptSupply = utils.scale(bptSupplyWei, -18);

    let userPools = {};
    let userLiquidity = {};

    for (const holder of usd_holders) {
        let userBalanceWei = await bPool.methods
            .balanceOf(holder)
            .call(undefined, i);
        let userBalance = utils.scale(userBalanceWei, -18);

        let userProportion = userBalance.div(bptSupply);

        userLiquidity[holder] = userProportion.times(BAL_PER_SNAPSHOT).dp(18);
    }

    return userLiquidity;
}

(async function () {
    for (i = END_BLOCK; i > START_BLOCK; i -= BLOCKS_PER_SNAPSHOT) {
        let blockRewards = await getRewardsAtBlock(i);
        let path = `piedao/usd/${WEEK}/${i}`;
        utils.writeData(blockRewards, path);
    }
})();
