const fs = require('fs');

const { argv } = require('yargs');
const { ethers } = require('ethers');
const { Pool } = require('pg');

const pool = new Pool();

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

if (argv.rpc) {
    provider = new ethers.providers.JsonRpcProvider(
        'https://api.archivenode.io/1i3jfwuzh6pbyk90geln824scx5vr7dm'
    );
}

const detectContracts = async () => {
    console.log('Detecting contract account holders');
    const contracts = new Set();
    const client = await pool.connect();

    const addressQuery = 'SELECT address FROM account_holders';

    const response = await client.query({ text: addressQuery });

    console.log('Checking all', response.rows.length, 'account holders');

    for (let i = 0; i < response.rows.length; i += 1) {
        const { address } = response.rows[i];

        if ((await provider.getCode(address)) !== '0x') {
            contracts.add(address);
            console.log('Detected', address);
        }
    }

    client.release();

    return Array.from(contracts).sort();
};

(async () => {
    try {
        const contracts = await detectContracts();
        fs.writeFileSync(
            'reports/piedao/smart_contracts.json',
            JSON.stringify(contracts, null, 4)
        );
    } catch (e) {
        console.log(e);
    }
    process.exit();
})();

// TODO: Look at each block stored in balances and sanity check it against totalSupply
