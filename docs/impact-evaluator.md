# Impact Evaluator

After deploying a new version of the [`spark-impact-evaluator`](https://github.com/filecoin-station/spark-impact-evaluator),
update the services mentioned in this document.

## contract

- Add address to https://www.notion.so/pl-strflt/Addresses-c1140fd90af94388a9bfbd4f4da2a377#5dda4b1708054349af91fa356e58b950
- Send FIL rewards to the contract

## Telemetry

- Replace `0x` and `f4` contract addresses https://github.com/filecoin-station/telegraf/blob/main/telegraf.conf
- If the ABI changed, replace method IDs https://github.com/filecoin-station/telegraf/blob/main/telegraf.conf
- Test your changes with `telegraf --config telegraf.conf --test`
- Commit, push and run `fly deploy`

## `spark-evaluate`

- Replace `0x` contract address https://github.com/filecoin-station/spark-evaluate/blob/main/bin/spark-evaluate.js
- If the ABI changed, replace https://github.com/filecoin-station/spark-evaluate/blob/main/lib/abi.json
- Push to `main` to deploy

## `spark-api`

- Replace `0x` contract address https://github.com/filecoin-station/spark-api/blob/main/spark-publish/ie-contract-config.js
- If the ABI changed, replace https://github.com/filecoin-station/spark-api/blob/main/spark-publish/abi.json
- Push to `main` to deploy

## Station Desktop

- Replace `0x` contract address
- 
