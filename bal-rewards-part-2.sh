if [ $# -lt 3 ]; then
  echo "usage: bash bal-rewards-part-2.sh <week> <startBlock> <endBlock>"
  exit 0
fi

NODE="ws://archive02.eth.dmvt.io:8545/ws/json_rpc"
WEEK=$1
STARTBLOCK=$2
ENDBLOCK=$3
BTC="0x0327112423f3a68efdf1fcf402f6c5cb9f7c33fd"
USD="0x9a48bd0ec040ea4f1d3147c025cd4076a2e71e3e"

export PGUSER=piedao
export PGDATABASE=piedao
export PGPASSWORD=piedao

node contract_detector.js --wss $NODE
node contract_reward_detector.js --files reports/piedao/combined_totals.json --wss $NODE

CONTRACTS=(0x7d2f4bcb767eb190aed0f10713fe4d9c07079ee8 0x302abcedf32b8534970a70c21eb848fc9af19f31 0xd4dbf96db2fdf8ed40296d8d104b371adf7dee12 0x92c366872c71d2751068690939d0c972e8241377 0x17a791d8e241d4be11a59f7073b3122bb019facd)

for TOKEN in "${CONTRACTS[@]}"
do
  AMOUNT=`node token_total.js --token $TOKEN`
  echo "Processing $AMOUNT for $TOKEN"
  mkdir -p reports/piedao/$TOKEN/$WEEK
  rm -rf reports/piedao/$TOKEN/$WEEK
  mkdir -p reports/piedao/$TOKEN/$WEEK

  node piedao.js --week $WEEK --startBlock $STARTBLOCK --endBlock $ENDBLOCK --token $TOKEN --amount $AMOUNT --wss $NODE > /dev/null
  node piedao_sum.js --week $WEEK --startBlock $STARTBLOCK --endBlock $ENDBLOCK --token $TOKEN --amount $AMOUNT --wss $NODE
done

node total_combiner.js --files reports/piedao/0x0327112423f3a68efdf1fcf402f6c5cb9f7c33fd/$WEEK/_totals.json,reports/piedao/0x9a48bd0ec040ea4f1d3147c025cd4076a2e71e3e/$WEEK/_totals.json,reports/piedao/0x7d2f4bcb767eb190aed0f10713fe4d9c07079ee8/$WEEK/_totals.json,reports/piedao/0x302abcedf32b8534970a70c21eb848fc9af19f31/$WEEK/_totals.json,reports/piedao/0xd4dbf96db2fdf8ed40296d8d104b371adf7dee12/$WEEK/_totals.json,reports/piedao/0x92c366872c71d2751068690939d0c972e8241377/$WEEK/_totals.json,reports/piedao/0x17a791d8e241d4be11a59f7073b3122bb019facd/$WEEK/_totals.json

