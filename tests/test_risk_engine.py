from detector.streaming import DetectionResult
from server.risk_engine import CallContext, RiskEngine


def make_detection(
    spoof_prob=0.0,
    liveness_score=1.0,
    smoothed_spoof_prob=None,
):
    if smoothed_spoof_prob is None:
        smoothed_spoof_prob = spoof_prob

    return DetectionResult(
        spoof_prob=spoof_prob,
        liveness_score=liveness_score,
        band="low",
        signals={"spoof_prob": spoof_prob},
        latency_ms=10.0,
        window_index=0,
        smoothed_spoof_prob=smoothed_spoof_prob,
    )


def test_low_risk_event():
    engine = RiskEngine()

    detection = make_detection(
        spoof_prob=0.0,
        liveness_score=1.0,
        smoothed_spoof_prob=0.0,
    )

    context = CallContext(
        caller_familiarity=1.0,
        transaction_risk=0.0,
    )

    event = engine.score(
        detection=detection,
        call_id="test-call",
        context=context,
    )

    assert event.risk_score == 0
    assert event.band == "low"


def test_uncertain_risk_band():
    engine = RiskEngine()

    detection = make_detection(
        spoof_prob=0.5,
        liveness_score=1.0,
        smoothed_spoof_prob=0.5,
    )

    context = CallContext(
        caller_familiarity=1.0,
        transaction_risk=0.0,
    )

    event = engine.score(
        detection=detection,
        call_id="test-call",
        context=context,
    )

    assert event.risk_score == 30
    assert event.band == "uncertain"


def test_medium_risk_band():
    engine = RiskEngine()

    detection = make_detection(
        spoof_prob=0.75,
        liveness_score=1.0,
        smoothed_spoof_prob=0.75,
    )

    context = CallContext(
        caller_familiarity=1.0,
        transaction_risk=0.0,
    )

    event = engine.score(
        detection=detection,
        call_id="test-call",
        context=context,
    )

    assert event.risk_score == 45
    assert event.band == "medium"


def test_high_risk_band():
    engine = RiskEngine()

    detection = make_detection(
        spoof_prob=1.0,
        liveness_score=0.0,
        smoothed_spoof_prob=1.0,
    )

    context = CallContext(
        caller_familiarity=0.0,
        transaction_risk=1.0,
    )

    event = engine.score(
        detection=detection,
        call_id="test-call",
        context=context,
    )

    assert event.risk_score == 100
    assert event.band == "high"


def test_risk_score_is_clamped():
    engine = RiskEngine()

    detection = make_detection(
        spoof_prob=2.0,
        liveness_score=-1.0,
        smoothed_spoof_prob=2.0,
    )

    context = CallContext(
        caller_familiarity=-1.0,
        transaction_risk=2.0,
    )

    event = engine.score(
        detection=detection,
        call_id="test-call",
        context=context,
    )

    assert 0 <= event.risk_score <= 100