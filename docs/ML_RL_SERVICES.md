# ML & RL Services Documentation

## ML Service (Port 3006)

### Overview

Machine Learning service for price prediction, signal classification, and regime detection.

### Models

#### 1. Price Predictor

**Type:** LSTM + Attention model

**Features:**
- Sequence length: 60 candles
- Features: 20+ indicators
- Multiple prediction horizons: 1m, 5m, 15m, 1h
- Monte Carlo uncertainty estimation

**API:**
```typescript
POST /api/v1/predict/price
Body: {
  features: number[][][],  // [samples, sequence_length, features]
  return_confidence: boolean
}
```

---

#### 2. Signal Classifier

**Type:** Gradient Boosting Classifier

**Features:**
- BUY, SELL, HOLD classification
- Probability calibration
- Feature importance analysis

**API:**
```typescript
POST /api/v1/predict/signal
Body: {
  features: number[][]  // [samples, features]
}
```

---

#### 3. Regime Detector

**Type:** Hidden Markov Model (HMM)

**Features:**
- BULL, BEAR, SIDEWAYS detection
- Transition probability matrix
- Regime statistics

**API:**
```typescript
POST /api/v1/predict/regime
Body: {
  observations: number[][]  // [samples, features]
}
```

---

## RL Service (Port 3007)

### Overview

Reinforcement Learning service with PPO, SAC, DQN agents.

### Agents

#### 1. PPO (Proximal Policy Optimization)

**Features:**
- Continuous action space
- Entropy regularization
- GAE advantage estimation

**Configuration:**
```yaml
learning_rate: 0.0003
n_steps: 2048
batch_size: 64
gamma: 0.99
```

---

#### 2. SAC (Soft Actor-Critic)

**Features:**
- Off-policy learning
- Automatic entropy adjustment
- Sample efficient

**Configuration:**
```yaml
learning_rate: 0.0003
buffer_size: 100000
tau: 0.005
ent_coef: auto
```

---

#### 3. DQN (Deep Q-Network)

**Features:**
- Discrete action space
- Experience replay
- Target network

**Configuration:**
```yaml
learning_rate: 0.0001
buffer_size: 100000
exploration_fraction: 0.1
```

---

### Trading Environment

**Observation Space:**
- OHLCV data (normalized)
- Technical indicators
- Position state
- Account balance

**Action Space:**
- 0: Hold
- 1: Buy
- 2: Sell
- 3: Close

**Reward:**
- Risk-adjusted returns
- Drawdown penalty

---

## Integration

### From Next.js:

```typescript
// ML Service
const mlResponse = await fetch('/api/ml/predict/price?XTransformPort=3006', {
  method: 'POST',
  body: JSON.stringify({ features })
});

// RL Service
const rlResponse = await fetch('/api/rl/train/start?XTransformPort=3007', {
  method: 'POST',
  body: JSON.stringify({ agent: 'ppo', total_timesteps: 100000 })
});
```

---

## Deployment

### ML Service:
```bash
cd mini-services/ml-service
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 3006
```

### RL Service:
```bash
cd mini-services/rl-service
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 3007
```
