const BigNumber = require('bignumber.js');
const cliProgress = require('cli-progress');
const fs = require('fs');

const { argv } = require('yargs');
const { ethers } = require('ethers');
const { Pool } = require('pg');

const utils = require('./utils');

const pool = new Pool();

const erc20 = [
    {
        constant: true,
        inputs: [{ name: '_owner', type: 'address' }],
        name: 'balanceOf',
        outputs: [{ name: 'balance', type: 'uint256' }],
        payable: false,
        stateMutability: 'view',
        type: 'function',
    },
    {
        constant: true,
        inputs: [],
        name: 'decimals',
        outputs: [{ name: '', type: 'uint8' }],
        payable: false,
        stateMutability: 'view',
        type: 'function',
    },
    {
        constant: true,
        inputs: [],
        name: 'totalSupply',
        outputs: [{ name: '', type: 'uint256' }],
        payable: false,
        stateMutability: 'view',
        type: 'function',
    },
];

BigNumber.config({
    EXPONENTIAL_AT: [-100, 100],
    ROUNDING_MODE: BigNumber.ROUND_DOWN,
    DECIMAL_PLACES: 18,
});

function bnum(val) {
    return new BigNumber(val.toString());
}

if (
    !argv.startBlock ||
    !argv.endBlock ||
    !argv.week ||
    !argv.token ||
    !argv.amount
) {
    console.log(
        'Usage: node piedao.js --week 1 --startBlock 10131642 --endBlock 10156690 --token 0x0327112423f3a68efdf1fcf402f6c5cb9f7c33fd --amount 6271.430272488392207776'
    );
    process.exit();
}

const END_BLOCK = argv.endBlock; // Closest block to reference time at end of week
const START_BLOCK = argv.startBlock; // Closest block to reference time at beginning of week
const WEEK = argv.week; // Week for mining distributions. Ex: 1

const BAL_PER_WEEK = bnum(argv.amount);
const BLOCKS_PER_SNAPSHOT = 64;
const BAL_PER_SNAPSHOT = BAL_PER_WEEK.div(
    bnum(Math.ceil((END_BLOCK - START_BLOCK) / 64))
); // Ceiling because it includes end block

let provider = new ethers.providers.JsonRpcProvider(
    'https://mainnet.infura.io/v3/e106b2b27c0f4941be1f2c183a20b3ea'
);

if (argv.archivenode) {
    provider = new ethers.providers.JsonRpcProvider(
        'http://archive01.eth.dmvt.io:8545'
    );
}

if (argv.wss) {
    provider = new ethers.providers.WebSocketProvider(argv.wss);
}

const getRewardsAtBlock = async (i, contract, decimals, holders) => {
    console.log('processing rewards for block', i);
    const client = await pool.connect();

    let bptSupplyWei = bnum(await contract.totalSupply({ blockTag: i }));
    let bptSupply = bptSupplyWei.dividedBy(10 ** decimals);

    let userPools = {};
    let userLiquidity = {};

    for (const holder of holders) {
        const balanceResponse = await client.query({
            text:
                `SELECT amount FROM balances ` +
                `WHERE token = '${argv.token}' ` +
                `AND address = '${holder}' ` +
                `AND "blockNumber" <= ${i} ` +
                `ORDER BY "blockNumber" DESC ` +
                `LIMIT 1`,
        });

        let userProportion = BigNumber(0);

        if (balanceResponse.rows[0] && balanceResponse.rows[0].amount) {
            userProportion = bnum(balanceResponse.rows[0].amount).div(
                bptSupply
            );
            if (!userProportion.isZero()) {
                console.log(
                    holder,
                    'gets',
                    userProportion.times(BAL_PER_SNAPSHOT).dp(18).toFixed(18)
                );
            }
        }

        userLiquidity[holder] = userProportion.times(BAL_PER_SNAPSHOT).dp(18);
    }

    client.release();

    return userLiquidity;
};

(async function () {
    console.log('started', argv);
    const client = await pool.connect();
    console.log(1);
    const contract = new ethers.Contract(argv.token, erc20, provider);
    console.log(1.5);
    const decimals = await contract.decimals();
    console.log(2);
    const response = await client.query({
        text: `SELECT address FROM account_holders WHERE token = '${argv.token}'`,
    });
    console.log(3, response.rows);
    const holders = response.rows.map(({ address }) => address);
    console.log('found', holders.length, 'holders');
    client.release();

    for (i = END_BLOCK; i > START_BLOCK; i -= BLOCKS_PER_SNAPSHOT) {
        let blockRewards = await getRewardsAtBlock(
            i,
            contract,
            decimals,
            holders
        );
        let path = `piedao/${argv.token}/${WEEK}/${i}`;
        utils.writeData(blockRewards, path);
    }

    process.exit();
})();
