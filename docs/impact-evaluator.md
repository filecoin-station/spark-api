# Impact Evaluator

After deploying a new version of the impact evaluator framework, update the
services mentioned in this document.

## contract

```js
await ieContractWithSigner.setRoundReward(ethers.utils.parseUnits('1.0', 'ether'))
await ieContractWithSigner.setNextRoundLength(60)
await ieContractWithSigner.grantRole(ieContractWithSigner.EVALUATE_ROLE(), '0xB0a808b5C49f5Ed7Af9EcAAaF033B2d937692877')
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
