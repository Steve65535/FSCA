# Manual Deployment Guide: Arkheion CBS on Sei Testnet

This guide is for live demo use.
You type every command manually in terminal.

## Goal

Run the full lifecycle in this exact order:

1. `arkheion init`
2. `arkheion cluster init`
3. `arkheion deploy`
4. `arkheion cluster link`
5. `arkheion cluster mount`
6. `arkheion cluster upgrade`

And clearly show hot upgrade behavior for `ID=2`.

## Network Parameters (Sei Testnet)

- Network name: `sei-testnet`
- RPC: `https://evm-rpc-testnet.sei-apis.com`
- Chain ID: `1328`
- Block confirmations: `1`

## 0) Prepare Workspace

```bash
export Arkheion_ACCOUNT_ADDRESS=0x9De4a080444b8BE731539D7483869058c1Bd768d
export Arkheion_PRIVATE_KEY='<your_private_key>'

mkdir -p ~/Desktop/arkheion-sei-manual
cd ~/Desktop/arkheion-sei-manual

# Copy CBS contracts from repository
cp -R /Users/steve/Desktop/arkheion-cli/demo/contracts ./contracts
```

## 1) Initialize Project (`arkheion init`)

```bash
arkheion init \
  --networkName sei-testnet \
  --rpc https://evm-rpc-testnet.sei-apis.com \
  --chainId 1328 \
  --blockConfirmations 1 \
  --accountPrivateKey "$Arkheion_PRIVATE_KEY" \
  --address "$Arkheion_ACCOUNT_ADDRESS"
```

## 2) Initialize Cluster (`arkheion cluster init`)

```bash
arkheion cluster init --threshold 1
```

## 3) Deploy CBS Contracts (`arkheion deploy`)

```bash
arkheion deploy --contract AccountStorage --description AccountStorage
arkheion deploy --contract TradeEngineV1 --description TradeEngineV1
arkheion deploy --contract RiskGuardV1 --description RiskGuardV1
```

Resolve addresses from `project.json`:

```bash
STORAGE=$(node -e "const c=require('./project.json');console.log(c.arkheion.alldeployedcontracts.find(x=>x.name==='AccountStorage').address)")
TRADE=$(node -e "const c=require('./project.json');console.log(c.arkheion.alldeployedcontracts.find(x=>x.name==='TradeEngineV1').address)")
RISK=$(node -e "const c=require('./project.json');console.log(c.arkheion.alldeployedcontracts.find(x=>x.name==='RiskGuardV1').address)")

echo "AccountStorage: $STORAGE"
echo "TradeEngineV1:  $TRADE"
echo "RiskGuardV1:    $RISK"
```

## 4) Link Dependencies (`arkheion cluster link`)

Link from TradeEngine to storage + risk guard:

```bash
arkheion cluster choose "$TRADE"
arkheion cluster link positive "$STORAGE" 1
arkheion cluster link positive "$RISK" 3
```

## 5) Mount Contracts (`arkheion cluster mount`)

```bash
arkheion cluster choose "$STORAGE"
arkheion cluster mount 1 AccountStorage

arkheion cluster choose "$TRADE"
arkheion cluster mount 2 TradeEngineV1

arkheion cluster choose "$RISK"
arkheion cluster mount 3 RiskGuardV1
```

Verify mounted list and topology:

```bash
arkheion cluster list mounted
arkheion cluster graph
```

## 6) Hot Upgrade (`arkheion cluster upgrade`)

Show `ID=2` info before upgrade:

```bash
arkheion cluster info 2
```

Upgrade V1 -> V2:

```bash
arkheion cluster upgrade --id 2 --contract TradeEngineV2
```

Show `ID=2` info after upgrade:

```bash
arkheion cluster info 2
arkheion cluster list mounted
arkheion cluster graph
```

## What to Say in Demo (Hot Upgrade)

- `ID=2` is unchanged (logical identity remains).
- Contract address for `ID=2` changes from `TradeEngineV1` to `TradeEngineV2`.
- Dependency topology remains available after upgrade.
- `AccountStorage` is not replaced, so core data layer remains isolated.

## Cleanup

```bash
unset Arkheion_PRIVATE_KEY Arkheion_ACCOUNT_ADDRESS
```
