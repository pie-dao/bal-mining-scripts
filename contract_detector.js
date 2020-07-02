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

const detectContracts = async () => {
    console.log('Detecting contract account holders');
    const contracts = new Set();
    const client = await pool.connect();

    const addressQuery = 'SELECT address FROM account_holders';

    const response = await client.query({ text: addressQuery });

    for (let i = 0; i < response.rows.length; i += 1) {
        const { address } = response.rows[i];

        if ((await provider.getCode(address)) !== '0x') {
            contracts.add(address);
        }
    }

    client.release();

    return contracts;
};

(async () => {
    try {
        console.log(await detectContracts());
    } catch (e) {
        console.log(e);
    }
    process.exit();
})();

// TODO: Look at each block stored in balances and sanity check it against totalSupply
