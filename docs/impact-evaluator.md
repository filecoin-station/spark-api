# Impact Evaluator

After deploying a new version of the impact evaluator framework, update the
services mentioned in this document.

## contract

```js
await ieContractWithSigner.setRoundReward(1000000000000000000 /* 1 FIL */)
await ieContractWithSigner.setNextRoundLength(60)
```

Fund contract using https://faucet.calibration.fildev.network/funds.html.

## Telemetry

- Replace `t4` and `0x` contract addresses https://github.com/filecoin-station/telegraf/blob/main/telegraf.conf
- If the ABI changed, replace method IDs https://github.com/filecoin-station/telegraf/blob/main/telegraf.conf
- Test your changes with `telegraf --config telegraf.conf --test`
- Commit, push and run `fly deploy`

## `spark-api`

- Replace `0x` contract address https://github.com/filecoin-station/spark-api/blob/main/spark-publish/ie-contract-config.js
- If the ABI changed, replace https://github.com/filecoin-station/spark-api/blob/main/spark-publish/abi.json
- Push to `main` to deploy

## `spark-evaluate`

- Replace `0x` contract address https://github.com/filecoin-station/spark-evaluate/blob/main/bin/spark-evaluate.js
- If the ABI changed, replace https://github.com/filecoin-station/spark-evaluate/blob/main/lib/abi.json
- Push to `main` to deploy
