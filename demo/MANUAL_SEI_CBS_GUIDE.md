# Manual Deployment Guide: FSCA CBS on Sei Testnet

This guide is for live demo use.
You type every command manually in terminal.

## Goal

Run the full lifecycle in this exact order:

1. `fsca init`
2. `fsca cluster init`
3. `fsca deploy`
4. `fsca cluster link`
5. `fsca cluster mount`
6. `fsca cluster upgrade`

And clearly show hot upgrade behavior for `ID=2`.

## Network Parameters (Sei Testnet)

- Network name: `sei-testnet`
- RPC: `https://evm-rpc-testnet.sei-apis.com`
- Chain ID: `1328`
- Block confirmations: `1`

## 0) Prepare Workspace

```bash
export FSCA_ACCOUNT_ADDRESS=0x9De4a080444b8BE731539D7483869058c1Bd768d
export FSCA_PRIVATE_KEY='<your_private_key>'

mkdir -p ~/Desktop/fsca-sei-manual
cd ~/Desktop/fsca-sei-manual

# Copy CBS contracts from repository
cp -R /Users/steve/Desktop/fsca-cli/demo/contracts ./contracts
```

## 1) Initialize Project (`fsca init`)

```bash
fsca init \
  --networkName sei-testnet \
  --rpc https://evm-rpc-testnet.sei-apis.com \
  --chainId 1328 \
  --blockConfirmations 1 \
  --accountPrivateKey "$FSCA_PRIVATE_KEY" \
  --address "$FSCA_ACCOUNT_ADDRESS"
```

## 2) Initialize Cluster (`fsca cluster init`)

```bash
fsca cluster init --threshold 1
```

## 3) Deploy CBS Contracts (`fsca deploy`)

```bash
fsca deploy --contract AccountStorage --description AccountStorage
fsca deploy --contract TradeEngineV1 --description TradeEngineV1
fsca deploy --contract RiskGuardV1 --description RiskGuardV1
```

Resolve addresses from `project.json`:

```bash
STORAGE=$(node -e "const c=require('./project.json');console.log(c.fsca.alldeployedcontracts.find(x=>x.name==='AccountStorage').address)")
TRADE=$(node -e "const c=require('./project.json');console.log(c.fsca.alldeployedcontracts.find(x=>x.name==='TradeEngineV1').address)")
RISK=$(node -e "const c=require('./project.json');console.log(c.fsca.alldeployedcontracts.find(x=>x.name==='RiskGuardV1').address)")

echo "AccountStorage: $STORAGE"
echo "TradeEngineV1:  $TRADE"
echo "RiskGuardV1:    $RISK"
```

## 4) Link Dependencies (`fsca cluster link`)

Link from TradeEngine to storage + risk guard:

```bash
fsca cluster choose "$TRADE"
fsca cluster link positive "$STORAGE" 1
fsca cluster link positive "$RISK" 3
```

## 5) Mount Contracts (`fsca cluster mount`)

```bash
fsca cluster choose "$STORAGE"
fsca cluster mount 1 AccountStorage

fsca cluster choose "$TRADE"
fsca cluster mount 2 TradeEngineV1

fsca cluster choose "$RISK"
fsca cluster mount 3 RiskGuardV1
```

Verify mounted list and topology:

```bash
fsca cluster list mounted
fsca cluster graph
```

## 6) Hot Upgrade (`fsca cluster upgrade`)

Show `ID=2` info before upgrade:

```bash
fsca cluster info 2
```

Upgrade V1 -> V2:

```bash
fsca cluster upgrade --id 2 --contract TradeEngineV2
```

Show `ID=2` info after upgrade:

```bash
fsca cluster info 2
fsca cluster list mounted
fsca cluster graph
```

## What to Say in Demo (Hot Upgrade)

- `ID=2` is unchanged (logical identity remains).
- Contract address for `ID=2` changes from `TradeEngineV1` to `TradeEngineV2`.
- Dependency topology remains available after upgrade.
- `AccountStorage` is not replaced, so core data layer remains isolated.

## Cleanup

```bash
unset FSCA_PRIVATE_KEY FSCA_ACCOUNT_ADDRESS
```
