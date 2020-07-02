const BigNumber = require('bignumber.js');
const fs = require('fs');

const { argv } = require('yargs');

const files = argv.files.split(',');

(async () => {
    try {
        const combined = {};

        for (let i = 0; i < files.length; i += 1) {
            const totals = JSON.parse(fs.readFileSync(files[i]));
            const addresses = Object.keys(totals);
            for (let a = 0; a < addresses.length; a += 1) {
                const address = addresses[a];
                combined[address] = combined[address] || BigNumber(0);
                combined[address] = combined[address].plus(totals[address]);
            }
        }

        fs.writeFileSync(
            'reports/piedao/combined_totals.json',
            JSON.stringify(combined, null, 4)
        );
    } catch (e) {
        console.log(e);
    }

    process.exit();
})();

// TODO: Look at each block stored in balances and sanity check it against totalSupply
