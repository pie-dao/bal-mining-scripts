const BigNumber = require('bignumber.js');
const fs = require('fs');

const { argv } = require('yargs');

const token = argv.token;

(async () => {
    try {
        const totals = JSON.parse(
            fs.readFileSync('reports/piedao/combined_totals.json')
        );
        console.log(totals[token]);
    } catch (e) {
        console.log(e);
    }

    process.exit();
})();
