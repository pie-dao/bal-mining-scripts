const { argv } = require('yargs');
const { ethers } = require('ethers');
const { Pool } = require('pg');

const pool = new Pool();

let provider = new ethers.providers.WebSocketProvider(
    'wss://mainnet.infura.io/ws/v3/e106b2b27c0f4941be1f2c183a20b3ea'
);

if (argv.archivenode) {
    provider = new ethers.providers.JsonRpcProvider(
        'https://archive01.eth.dmvt.io'
    );
}

if (argv.wss) {
    provider = new ethers.providers.WebSocketProvider(argv.wss);
}

if (!argv.startBlock || !argv.endBlock) {
    console.log(
        'Usage: node block_import.js --startBlock 10221819 --endBlock 10312236 --archivenode true'
    );
    process.exit();
}

const importBlock = async (n) => {
    const data = await provider.getBlockWithTransactions(n);

    const client = await pool.connect();

    const {
        difficulty,
        extraData,
        gasLimit,
        gasUsed,
        hash,
        miner,
        nonce,
        number,
        parentHash,
        timestamp,
        transactions,
    } = data;

    const blockQuery =
        'INSERT INTO ' +
        'blocks("difficulty", "extraData", "gasLimit", "gasUsed", "hash", "miner", "nonce", "number", "parentHash", "timestamp") ' +
        'VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ' +
        'RETURNING (id)';

    const transactionQuery =
        'INSERT INTO ' +
        'transactions("blockId", "chainId", "data", "from", "gasLimit", "gasPrice", "hash", "nonce", "r", "s", "to", "transactionIndex", "v", "value") ' +
        'VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)';

    const blockPayload = {
        text: blockQuery,
        values: [
            difficulty,
            extraData,
            gasLimit.toString(),
            gasUsed.toString(),
            hash,
            miner,
            nonce,
            number,
            parentHash,
            timestamp,
        ],
    };

    console.log(blockPayload);

    const response = await client.query(blockPayload);

    const blockId = response.rows[0].id;

    for (let i = 0; i < transactions.length; i += 1) {
        const transaction = data.transactions[i];

        const payload = {
            text: transactionQuery,
            values: [
                blockId,
                transaction.chainId,
                transaction.data,
                (transaction.from || '').toLowerCase(),
                transaction.gasLimit.toString(),
                transaction.gasPrice.toString(),
                transaction.hash,
                transaction.nonce,
                transaction.r,
                transaction.s,
                (transaction.to || '').toLowerCase(),
                transaction.transactionIndex,
                transaction.v,
                transaction.value.toString(),
            ],
        };

        console.log(payload);

        await client.query(payload);
    }

    client.release();
};

(async () => {
    for (let i = argv.startBlock; i <= argv.endBlock; i += 1) {
        console.log(`----- IMPORTING BLOCK ${i} -----`);
        await importBlock(i);
    }

    process.exit();
})();
