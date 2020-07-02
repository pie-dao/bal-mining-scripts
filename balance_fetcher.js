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

if (!argv.startBlock || !argv.endBlock) {
    console.log(
        'Usage: node balance_fetcher.js --startBlock 10176705 --endBlock 10312236 --archivenode true'
    );
    process.exit();
}

let skipTokens = [];
if (argv.skipTokens) {
    skipTokens = argv.skipTokens.split(',');
}

let onlyTokens = [];
if (argv.onlyTokens) {
    onlyTokens = argv.onlyTokens.split(',');
}

const fetchBlockNumbers = async () => {
    console.log('Fetching block numbers');
    const blockIds = new Set();
    const client = await pool.connect();

    const blockIdQuery = 'SELECT id FROM blocks WHERE number = $1';
    const tokenQuery = 'SELECT token FROM account_holders GROUP BY token';
    const fromQuery =
        'SELECT "blockId" FROM transactions WHERE transactions.from = ';
    const toQuery =
        'SELECT "blockId" FROM transactions WHERE transactions.to = ';
    const dataQuery =
        'SELECT id, "blockId" FROM transactions WHERE data LIKE \'%000000000000000000000000';
    const multiBlockIdQuery = 'SELECT number FROM blocks WHERE blocks.id IN';

    // console.log({ text: blockIdQuery, values: [argv.startBlock] });
    // console.log({ text: blockIdQuery, values: [argv.endBlock] });
    const startBlockResponse = await client.query({
        text: blockIdQuery,
        values: [argv.startBlock],
    });
    const endBlockResponse = await client.query({
        text: blockIdQuery,
        values: [argv.endBlock],
    });

    // console.log(1, startBlockResponse.rows, endBlockResponse.rows)

    if (!startBlockResponse.rows[0] || !endBlockResponse.rows[0]) {
        console.error(
            'Could not find block range requested. Please import it first with block_import.js'
        );
        process.exit();
    }

    // console.log(2);
    const startBlockId = startBlockResponse.rows[0].id;
    const endBlockId = endBlockResponse.rows[0].id;

    blockIds.add(startBlockId);
    blockIds.add(endBlockId);

    const blockConstraint = `AND "blockId" < ${endBlockId} AND "blockId" > ${startBlockId}`;

    // console.log({ text: tokenQuery })
    const tokenResponse = await client.query({ text: tokenQuery });
    // console.log(3, tokenResponse.rows);

    for (let i = 0; i < tokenResponse.rows.length; i += 1) {
        const token = tokenResponse.rows[i].token;
        if (skipTokens.includes(token)) {
            continue;
        }

        if (onlyTokens.length > 0 && !onlyTokens.includes(token)) {
            continue;
        }

        // console.log({ text: `${fromQuery} '${token}'` });
        const fromResponse = await client.query({
            text: `${fromQuery} '${token}' ${blockConstraint}`,
        });
        // console.log(fromResponse.rows);
        // console.log({ text: `${toQuery} '${token}'` });
        const toResponse = await client.query({
            text: `${toQuery} '${token}' ${blockConstraint}`,
        });
        // console.log(toResponse.rows);
        const dataResponse = await client.query({
            text: `${dataQuery}${token.substring(
                2,
                token.length
            )}%' ${blockConstraint}`,
        });

        fromResponse.rows.forEach(({ blockId }) => blockIds.add(blockId));
        toResponse.rows.forEach(({ blockId }) => blockIds.add(blockId));
        dataResponse.rows.forEach(({ blockId }) => blockIds.add(blockId));
    }

    // console.log(4, { text: `${multiBlockIdQuery} (${Array.from(blockIds).join(',')})` });
    const response = await client.query({
        text: `${multiBlockIdQuery} (${Array.from(blockIds).join(',')})`,
    });

    client.release();

    return new Set(response.rows.map(({ number }) => number));
};

const updateAccountHolderList = async () => {
    console.log('Updating list of account holders for all tokens');
    const client = await pool.connect();

    console.log(
        (await client.query({ text: 'SELECT COUNT(*) FROM account_holders' }))
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
    const tokenResponse = await client.query({ text: tokenQuery });
    // console.log(3, tokenResponse.rows);

    for (let i = 0; i < tokenResponse.rows.length; i += 1) {
        const token = tokenResponse.rows[i].token;
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

        for (let t = 0; t < fromResponse.rows.length; t += 1) {
            const { to } = fromResponse.rows[t];
            const payload = { text: accountQuery, values: [token, to] };
            // console.log(payload);
            await client.query(payload);
        }

        for (let t = 0; t < toResponse.rows.length; t += 1) {
            const { from } = toResponse.rows[t];
            const payload = { text: accountQuery, values: [token, from] };
            // console.log(payload);
            await client.query(payload);
        }

        for (let t = 0; t < dataResponse.rows.length; t += 1) {
            const { from, to } = dataResponse.rows[t];
            let payload = { text: accountQuery, values: [token, from] };
            await client.query(payload);
            payload = { text: accountQuery, values: [token, to] };
            await client.query(payload);
        }
    }

    console.log(
        (await client.query({ text: 'SELECT COUNT(*) FROM account_holders' }))
            .rows[0]
    );

    client.release();
};

const contracts = {};

const updateBalances = async (blockNumber) => {
    const client = await pool.connect();

    let accountQuery = 'SELECT token, address FROM account_holders';

    if (skipTokens.length > 0) {
        accountQuery = `${accountQuery} WHERE token NOT IN ('${skipTokens.join(
            "','"
        )}')`;
    }

    if (onlyTokens.length > 0) {
        accountQuery = `${accountQuery} WHERE token IN ('${onlyTokens.join(
            "','"
        )}')`;
    }

    const balanceQuery =
        'INSERT INTO ' +
        'balances("token", "address", "blockNumber", "amount") ' +
        'VALUES($1, $2, $3, $4)';

    const accountResponse = await client.query({ text: accountQuery });

    console.log(
        blockNumber,
        'Fetching balance data for',
        accountResponse.rows.length,
        'accounts'
    );

    const tokens = {};

    for (let i = 0; i < accountResponse.rows.length; i += 1) {
        const { address, token } = accountResponse.rows[i];
        tokens[token] = tokens[token] || [];
        tokens[token].push(address);
    }

    const balances = {};
    for (let i = 0; i < Object.keys(tokens).length; i += 1) {
        const token = Object.keys(tokens)[i];
        let { contract, decimals } = contracts[token] || {};

        if (!contract) {
            contract = new ethers.Contract(token, erc20, provider);
            decimals = await contract.decimals();
            contracts[token] = { contract, decimals };
        }

        console.log(
            'Fetching',
            tokens[token].length,
            'balances for token',
            token
        );

        balances[token] = await Promise.all(
            tokens[token].map((address) =>
                contract.balanceOf(address, { blockTag: blockNumber })
            )
        );

        // await new Promise((resolve) => {
        // setTimeout(() => resolve(), 2000);
        // });
    }

    for (let i = 0; i < accountResponse.rows.length; i += 1) {
        const { address, token } = accountResponse.rows[i];
        console.log(
            'Processing',
            token,
            'balance at block',
            blockNumber,
            'for account',
            address
        );

        const skipResponse = await client.query({
            text:
                `SELECT amount FROM balances ` +
                `WHERE token='${token}' ` +
                `AND address='${address}' ` +
                `AND "blockNumber" = ${blockNumber} ` +
                `ORDER BY "blockNumber" DESC LIMIT 1`,
        });

        let skip = false;

        [
            {
                tokenToCheck: '0x9a48bd0ec040ea4f1d3147c025cd4076a2e71e3e',
                starts: 10224368,
            },
            {
                tokenToCheck: '0x381479aef601d864a0b3882e96e23438ff3011e5',
                starts: 10202297,
            },
            {
                tokenToCheck: '0xd764bb9822ee16097140031b017640e7a293e57f',
                starts: 10301956,
            },
            {
                tokenToCheck: '0x302abcedf32b8534970a70c21eb848fc9af19f31',
                starts: 10324501,
            },
            {
                tokenToCheck: '0x7d2f4bcb767eb190aed0f10713fe4d9c07079ee8',
                starts: 10328235,
            },
            {
                tokenToCheck: '0x92c366872c71d2751068690939d0c972e8241377',
                starts: 10329578,
            },
            {
                tokenToCheck: '0x17a791d8e241d4be11a59f7073b3122bb019facd',
                starts: 10279373,
            },
            {
                tokenToCheck: '0x3aa60a199f776ec726560d6d1edeac7c2f85072c',
                starts: 10330458,
            },
            {
                tokenToCheck: '0x28deb2eaddf8dc85f51027d42f8b16ca3efb5462',
                starts: 10326645,
            },
            {
                tokenToCheck: '0x9dfa6626eaf26635d48210714ff7fe5ef09fb72f',
                starts: 10347913,
            },
            {
                tokenToCheck: '0x8cf00a2a0044c7632bf1075694567ecb7d069d1e',
                starts: 10351980,
            },
            {
                tokenToCheck: '0xd00c7066ed0fa2dd8e54d39caf4854e5eb3980ec',
                starts: 10356769,
            },
        ].forEach(({ tokenToCheck, starts }) => {
            if (token === tokenToCheck && blockNumber < starts) {
                skip = true;
            }
        });

        if (skip) {
            console.log(token, 'does not exist at this block');
            continue;
        }

        if (skipResponse.rows.length > 0) {
            console.log('Balance already stored in the database');
            continue;
        }

        let { decimals } = contracts[token] || {};

        /*
        if (!contract) {
            contract = new ethers.Contract(token, erc20, provider);
            decimals = await contract.decimals();
            contracts[token] = { contract, decimals };
        }

        let balance;

        try {
            balance = BigNumber((await contract.balanceOf(address, { blockTag: blockNumber })).toString());
        } catch (e) {
            console.log('BALANCE UNAVAILABLE', token, address, e.message);
            continue;
        }*/

        const loc = tokens[token].indexOf(address);

        const balance = BigNumber(balances[token][loc].toString());

        const normalizedBalance = balance.dividedBy(10 ** decimals);

        const response = await client.query({
            text:
                `SELECT amount FROM balances ` +
                `WHERE token='${token}' ` +
                `AND address='${address}' ` +
                `AND "blockNumber" <= ${blockNumber} ` +
                `ORDER BY "blockNumber" DESC LIMIT 1`,
        });

        const existingBalance = BigNumber((response.rows[0] || {}).amount);

        if (normalizedBalance.isEqualTo(existingBalance)) {
            console.log('Already have balance for', token, address);
            continue;
        }

        const payload = {
            text: balanceQuery,
            values: [
                token,
                address,
                blockNumber,
                normalizedBalance.toFixed(decimals),
            ],
        };
        console.log('Storing balance', payload.values[3]);
        await client.query(payload);
    }

    client.release();
};

(async () => {
    try {
        let blockNumbers = Array.from(await fetchBlockNumbers()).sort();
        blockNumbers = blockNumbers.filter((block) => {
            return (
                block >= parseInt(argv.startBlock, 10) &&
                block <= parseInt(argv.endBlock, 10)
            );
        });

        console.log('found', blockNumbers.length, 'blocks');

        // await updateAccountHolderList();

        for (let i = 0; i < blockNumbers.length; i += 1) {
            await updateBalances(blockNumbers[i]);
            console.log(
                '--------- BLOCKS REMAINING: ',
                blockNumbers.length - i,
                '---------'
            );
        }
    } catch (e) {
        console.log(e);
    }
    process.exit();
})();

// TODO: Look at each block stored in balances and sanity check it against totalSupply
