const BigNumber = require('bignumber.js');
const fs = require('fs');

const { argv } = require('yargs');

const files = argv.files.split(',');

(async () => {
    try {
        const rewarded = new Set();
        const contracts = new Set(
            JSON.parse(fs.readFileSync('reports/piedao/smart_contracts.json'))
        );

        for (let i = 0; i < files.length; i += 1) {
            const totals = JSON.parse(fs.readFileSync(files[i]));
            const addresses = Object.keys(totals);
            for (let a = 0; a < addresses.length; a += 1) {
                const address = addresses[a];
                if (contracts.has(address)) {
                    rewarded.add(address);
                }
            }
        }

        fs.writeFileSync(
            'reports/piedao/smart_contracts_rewarded.json',
            JSON.stringify(Array.from(rewarded), null, 4)
        );
    } catch (e) {
        console.log(e);
    }

    process.exit();
})();

// TODO: Look at each block stored in balances and sanity check it against totalSupply
