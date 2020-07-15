const BigNumber = require('bignumber.js');

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
        'http://archive01.eth.dmvt.io:8545'
    );
}

if (argv.wss) {
    provider = new ethers.providers.WebSocketProvider(argv.wss);
}

let skipTokens = [];
if (argv.skipTokens) {
    skipTokens = argv.skipTokens.split(',');
}

let onlyTokens = [];
if (argv.onlyTokens) {
    onlyTokens = argv.onlyTokens.split(',');
}

const updateAccountHolderList = async () => {
    console.log('Updating list of account holders for all tokens');
    const client1 = await pool.connect();
    const client2 = await pool.connect();
    const client3 = await pool.connect();

    console.log(
        (await client1.query({ text: 'SELECT COUNT(*) FROM account_holders' }))
            .rows[0]
    );

    const tokenQuery = 'SELECT token FROM account_holders GROUP BY token';
    const fromQuery =
        'SELECT "to" FROM transactions WHERE transactions.from = ';
    const toQuery = 'SELECT "from" FROM transactions WHERE transactions.to = ';
    const dataQuery =
        'SELECT "to", "from" FROM transactions WHERE data LIKE \'%000000000000000000000000';
    const accountQuery =
        'INSERT INTO ' +
        'account_holders("token", "address") ' +
        'VALUES($1, $2) ' +
        'ON CONFLICT ON CONSTRAINT account_holders_uniq DO NOTHING';

    // console.log({ text: tokenQuery })
    const tokenResponse = await client1.query({ text: tokenQuery });
    // console.log(3, tokenResponse.rows);

    for (let i = 0; i < tokenResponse.rows.length; i += 1) {
        const token = tokenResponse.rows[i].token;

        const [fromResponse, toResponse, dataResponse] = await Promise.all([
            await client1.query({
                text: `${fromQuery} '${token}'`,
            }),
            await client2.query({
                text: `${toQuery} '${token}'`,
            }),
            await client3.query({
                text: `${dataQuery}${token.substring(2, token.length)}%'`,
            }),
        ]);

        /*
        // console.log({ text: `${fromQuery} '${token}'` });
        const fromResponse = await client.query({
            text: `${fromQuery} '${token}'`,
        });
        // console.log(fromResponse.rows);
        // console.log({ text: `${toQuery} '${token}'` });
        const toResponse = await client.query({
            text: `${toQuery} '${token}'`,
        });
        // console.log(toResponse.rows);
        const dataResponse = await client.query({
            text: `${dataQuery}${token.substring(2, token.length)}%'`,
        });
        */

        for (let t = 0; t < fromResponse.rows.length; t += 1) {
            const { to } = fromResponse.rows[t];
            const payload = { text: accountQuery, values: [token, to] };
            // console.log(payload);
            await client1.query(payload);
        }

        for (let t = 0; t < toResponse.rows.length; t += 1) {
            const { from } = toResponse.rows[t];
            const payload = { text: accountQuery, values: [token, from] };
            // console.log(payload);
            await client1.query(payload);
        }

        for (let t = 0; t < dataResponse.rows.length; t += 1) {
            const { from, to } = dataResponse.rows[t];
            let payload = { text: accountQuery, values: [token, from] };
            await client1.query(payload);
            payload = { text: accountQuery, values: [token, to] };
            await client1.query(payload);
        }
    }

    console.log(
        (await client1.query({ text: 'SELECT COUNT(*) FROM account_holders' }))
            .rows[0]
    );

    client1.release();
    client2.release();
    client3.release();
};

(async () => {
    try {
        await updateAccountHolderList();
    } catch (e) {
        console.log(e);
    }
    process.exit();
})();
