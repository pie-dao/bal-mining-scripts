if [ $# -lt 5 ]; then
  echo "usage: bash bal-rewards-part-1.sh <week> <startBlock> <endBlock> <btcBalAmount> <usdBalAmount>"
  exit 0
fi

NODE="ws://archive02.eth.dmvt.io:8545/ws/json_rpc"
WEEK=$1
STARTBLOCK=$2
ENDBLOCK=$3
BTCBAL=$4
USDBAL=$5
BTC="0x0327112423f3a68efdf1fcf402f6c5cb9f7c33fd"
USD="0x9a48bd0ec040ea4f1d3147c025cd4076a2e71e3e"

export PGUSER=piedao
export PGDATABASE=piedao
export PGPASSWORD=piedao

if [ $# -ne 6 ]; then
  echo "updating account holders..."
  node account_holders.js --wss $NODE
fi

# On sanity check failures, comment these two out and uncomment the ones below
echo "node balance_fetcher.js --startBlock $STARTBLOCK --endBlock $ENDBLOCK --wss $NODE"
node balance_fetcher.js --startBlock $STARTBLOCK --endBlock $ENDBLOCK --wss $NODE

# echo "node balance_fetcher.js --startBlock $STARTBLOCK --endBlock $ENDBLOCK --onlyTokens $BTC,$USD --wss $NODE"
# node balance_fetcher.js --startBlock $STARTBLOCK --endBlock $ENDBLOCK --onlyTokens $BTC,$USD --wss $NODE

mkdir -p ./reports/piedao/$BTC/$WEEK
mkdir -p ./reports/piedao/$USD/$WEEK

echo "rm -rf ./reports/piedao/$BTC/$WEEK"
rm -rf ./reports/piedao/$BTC/$WEEK
echo "rm -rf ./reports/piedao/$USD/$WEEK"
rm -rf ./reports/piedao/$USD/$WEEK

echo "mkdir -p ./reports/piedao/$BTC/$WEEK"
mkdir -p ./reports/piedao/$BTC/$WEEK
echo "mkdir -p ./reports/piedao/$USD/$WEEK"
mkdir -p ./reports/piedao/$USD/$WEEK

echo "node piedao.js --week $WEEK --startBlock $STARTBLOCK --endBlock $ENDBLOCK --token $BTC --amount $BTCBAL --wss $NODE"
node piedao.js --week $WEEK --startBlock $STARTBLOCK --endBlock $ENDBLOCK --token $BTC --amount $BTCBAL --wss $NODE
echo "node piedao.js --week $WEEK --startBlock $STARTBLOCK --endBlock $ENDBLOCK --token $USD --amount $USDBAL --wss $NODE"
node piedao.js --week $WEEK --startBlock $STARTBLOCK --endBlock $ENDBLOCK --token $USD --amount $USDBAL --wss $NODE

echo "node piedao_sum.js --week $WEEK --startBlock $STARTBLOCK --endBlock $ENDBLOCK --token $BTC --amount $BTCBAL --wss $NODE"
node piedao_sum.js --week $WEEK --startBlock $STARTBLOCK --endBlock $ENDBLOCK --token $BTC --amount $BTCBAL --wss $NODE
echo "node piedao_sum.js --week $WEEK --startBlock $STARTBLOCK --endBlock $ENDBLOCK --token $USD --amount $USDBAL --wss $NODE"
node piedao_sum.js --week $WEEK --startBlock $STARTBLOCK --endBlock $ENDBLOCK --token $USD --amount $USDBAL --wss $NODE

echo "running sanity check..."
echo "node balance_sanity_check.js --wss $NODE"
node balance_sanity_check.js --wss $NODE > sanity.tmp

echo "node total_combiner.js --files reports/piedao/$BTC/$WEEK/_totals.json,reports/piedao/$USD/$WEEK/_totals.json"
node total_combiner.js --files reports/piedao/$BTC/$WEEK/_totals.json,reports/piedao/$USD/$WEEK/_totals.json

cat sanity.tmp | grep $BTC
cat sanity.tmp | grep $USD
rm sanity.tmp

echo "if any of the above numbers are not 0, fix and then run:"
echo "bash bal-rewards-part-1.sh $WEEK $STARTBLOCK $ENDBLOCK $BTCBAL $USDBAL --skip-account-detection"
echo "node piedao.js --week $WEEK --startBlock $STARTBLOCK --endBlock $ENDBLOCK --token $USD --amount $USDBAL --wss $NODE"

