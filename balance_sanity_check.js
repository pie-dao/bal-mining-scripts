const BigNumber = require('bignumber.js');
const fs = require('fs');

const { argv } = require('yargs');
const { ethers } = require('ethers');
const { Pool } = require('pg');

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

let provider = new ethers.providers.JsonRpcProvider(
    'https://mainnet.infura.io/v3/e106b2b27c0f4941be1f2c183a20b3ea'
);

if (argv.archivenode) {
    provider = new ethers.providers.JsonRpcProvider(
        'https://archive01.eth.dmvt.io'
    );
}

if (argv.wss) {
    provider = new ethers.providers.WebSocketProvider(argv.wss);
}

const contracts = {};

const fetchBlockTotals = async () => {
    const blockTotals = {};
    const client = await pool.connect();

    const balanceQuery =
        'SELECT "blockNumber", token, ' +
        'array_agg(amount) as amounts, ' +
        'array_agg(address) as addresses ' +
        'FROM balances ' +
        'GROUP BY "blockNumber", token';

    const balanceResult = await client.query({ text: balanceQuery });

    fs.writeFileSync(
        'reports/piedao/sanity-query.json',
        JSON.stringify(balanceResult.rows, null, 4)
    );

    for (let i = 0; i < balanceResult.rows.length; i += 1) {
        const { blockNumber, token, amounts, addresses } = balanceResult.rows[
            i
        ];
        blockTotals[token] = blockTotals[token] || {};
        blockTotals[token][blockNumber] = {};
        for (let a = 0; a < addresses.length; a += 1) {
            blockTotals[token][blockNumber][addresses[a]] = {
                raw: amounts[a],
            };
        }
    }

    const tokens = Object.keys(blockTotals);

    console.log('tokens', tokens);

    for (let t = 0; t < tokens.length; t += 1) {
        const token = tokens[t];
        const blocks = Object.keys(blockTotals[token]).sort();
        let lastSet = {};

        let { contract, decimals } = contracts[token] || {};

        if (!contract) {
            contract = new ethers.Contract(token, erc20, provider);
            decimals = await contract.decimals();
            contracts[token] = { contract, decimals };
        }

        for (let b = 0; b < blocks.length; b += 1) {
            const block = blocks[b];
            const update = { ...lastSet };
            Object.keys(update).forEach((key) => {
                update[key].derived = true;
            });
            lastSet = { ...update, ...blockTotals[token][block] };
            console.log('VALUES', token, block, Object.values(lastSet));

            blockTotals[token][block] = { ...lastSet };
            blockTotals[token][block].totalBalances = Object.values(lastSet)
                .reduce((acc, { raw }) => acc.plus(raw), BigNumber(0))
                .toFixed(decimals);

            const opts = { blockTag: parseInt(block, 10) };
            const totalSupply = await contract.totalSupply(opts);
            blockTotals[token][block].totalSupply = BigNumber(
                totalSupply.toString()
            )
                .dividedBy(10 ** decimals)
                .toFixed(decimals);
            blockTotals[token][block].diff = BigNumber(
                blockTotals[token][block].totalSupply
            )
                .minus(blockTotals[token][block].totalBalances)
                .toFixed(decimals);
        }
    }

    client.release();

    return blockTotals;
};

(async () => {
    try {
        const blockTotals = await fetchBlockTotals();
        // const blockTotals = JSON.parse(fs.readFileSync('reports/piedao/sanity.json'));

        // console.log('totals', blockTotals);

        fs.writeFileSync(
            'reports/piedao/sanity.json',
            JSON.stringify(blockTotals, null, 4)
        );

        const tokens = Object.keys(blockTotals);
        const fails = {};

        for (let t = 0; t < tokens.length; t += 1) {
            const token = tokens[t];
            const blocks = Object.keys(blockTotals[token])
                .map((b) => parseInt(b, 10))
                .sort();
            for (let b = 0; b < blocks.length; b += 1) {
                const block = blocks[b].toString();
                console.log(token, block, blockTotals[token][block].diff);
                if (
                    blockTotals[token][block].diff &&
                    !BigNumber(blockTotals[token][block].diff).isZero()
                ) {
                    fails[token] = fails[token] || {};
                    fails[token][block] = { ...blockTotals[token][block] };
                }
            }
        }

        fs.writeFileSync(
            'reports/piedao/sanity_fails.json',
            JSON.stringify(fails, null, 4)
        );
    } catch (e) {
        console.log(e);
    }

    process.exit();
})();

// TODO: Look at each block stored in balances and sanity check it against totalSupply
