"""Protocol tests that run without the ML deps: python test_protocol.py"""
import json

from protocol import build_frame, encode_frame


def main() -> None:
    f = build_frame("hello", 1000, 2000, True, speaker="me")
    assert f == {"text": "hello", "startedAt": 1000, "endedAt": 2000, "final": True, "speaker": "me"}, f

    f2 = build_frame("hi", 0, 500, False)
    assert "speaker" not in f2, f2
    assert f2["final"] is False, f2

    d = json.loads(encode_frame("x", 1, 2, True, confidence=0.9))
    assert d["text"] == "x" and d["confidence"] == 0.9, d

    print("protocol tests passed")


if __name__ == "__main__":
    main()
