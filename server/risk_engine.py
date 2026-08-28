import json
from pathlib import Path


class RiskEngine:
    def __init__(self, config_path: str = "config/risk_weights.json"):
        # Load weights from config
        self.weights = self._load_weights(config_path)

    def _load_weights(self, config_path: str) -> dict:
        path = Path(config_path)
        if not path.exists():
            # Fallback to default if not found
            return {
                "model_confidence": 0.60,
                "caller_context_score": 0.20,
                "transaction_context_score": 0.15,
                "historical_anomaly_score": 0.05
            }
        with open(path, "r") as f:
            return json.load(f)

    def calculate_risk(self, detector_output: dict, call_context: dict) -> dict:
        """
        Accepts detector output (smoothed spoof prob + sub-scores) and
        call_context (caller_familiarity, transaction_amount, historical_anomaly),
        and returns the exact JSON contract.
        """
        model_confidence = detector_output.get("smoothed_spoof_prob", detector_output.get("spoof_prob", 0.0))
        caller_score = call_context.get("caller_context_score", 0.0)
        transaction_score = call_context.get("transaction_context_score", 0.0)
        historical_score = call_context.get("historical_anomaly_score", 0.0)

        # Apply Risk Formula
        risk_score_raw = (
            self.weights["model_confidence"] * model_confidence +
            self.weights["caller_context_score"] * caller_score +
            self.weights["transaction_context_score"] * transaction_score +
            self.weights["historical_anomaly_score"] * historical_score
        )
        
        # Scale to 0-100
        risk_score = round(risk_score_raw * 100)

        # Determine band & recommendation
        if risk_score < 40:
            band = "low"
            recommendation = "Proceed safely."
        elif risk_score < 70:
            band = "medium"
            recommendation = "Verify identity with a secondary method (e.g., OTP)."
        else:
            band = "high"
            recommendation = "URGENT: Likely spoofed call. Suspend transaction immediately."

        # Construct exact JSON shape
        return {
            "risk_score": risk_score,
            "band": band,
            "signals": {
                "spectral_artifact_score": round(detector_output.get("spectral_artifact_score", 0.0), 2),
                "prosody_irregularity_score": round(detector_output.get("prosody_irregularity_score", 0.0), 2),
                "caller_context_score": round(caller_score, 2),
                "transaction_context_score": round(transaction_score, 2)
            },
            "recommendation": recommendation
        }


if __name__ == "__main__":
    engine = RiskEngine()

    print("=== Testing Risk Engine ===")
    
    # Test Case 1: Low Risk (Genuine)
    det_out_1 = {"smoothed_spoof_prob": 0.05, "spectral_artifact_score": 0.02, "prosody_irregularity_score": 0.03}
    ctx_1 = {"caller_context_score": 0.1, "transaction_context_score": 0.2, "historical_anomaly_score": 0.0}
    res_1 = engine.calculate_risk(det_out_1, ctx_1)
    print("\nTest 1 (Low Risk):", json.dumps(res_1, indent=2))

    # Test Case 2: Medium Risk (Suspicious context, weak model signal)
    det_out_2 = {"smoothed_spoof_prob": 0.40, "spectral_artifact_score": 0.45, "prosody_irregularity_score": 0.35}
    ctx_2 = {"caller_context_score": 0.6, "transaction_context_score": 0.8, "historical_anomaly_score": 0.5}
    res_2 = engine.calculate_risk(det_out_2, ctx_2)
    print("\nTest 2 (Medium Risk):", json.dumps(res_2, indent=2))

    # Test Case 3: High Risk (Definite spoof)
    det_out_3 = {"smoothed_spoof_prob": 0.95, "spectral_artifact_score": 0.98, "prosody_irregularity_score": 0.92}
    ctx_3 = {"caller_context_score": 0.9, "transaction_context_score": 0.7, "historical_anomaly_score": 0.8}
    res_3 = engine.calculate_risk(det_out_3, ctx_3)
    print("\nTest 3 (High Risk):", json.dumps(res_3, indent=2))
