from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import base64
import io
from PIL import Image
import numpy as np

try:
    import cv2
except Exception as e:  # pragma: no cover
    raise RuntimeError("OpenCV is required: pip install -r requirements.txt") from e


app = FastAPI(title="QR Decoder (OpenCV)")


class DecodeRequest(BaseModel):
    imageBase64: str  # DataURL or raw base64 of JPG/PNG


def _dataurl_to_bytes(dataurl: str) -> bytes:
    if dataurl.startswith("data:"):
        # data:[<mediatype>][;base64],<data>
        comma = dataurl.find(',')
        if comma == -1:
            raise ValueError("Invalid data URL")
        return base64.b64decode(dataurl[comma + 1:])
    return base64.b64decode(dataurl)


@app.post("/decode")
def decode(req: DecodeRequest):
    try:
        img_bytes = _dataurl_to_bytes(req.imageBase64)
        image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        frame = np.array(image)
        frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)

        detector = cv2.QRCodeDetector()
        data, points, _ = detector.detectAndDecode(frame)
        if data:
            return {"text": data}

        # Try grayscale + equalize as fallback
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(gray)
        data, points, _ = detector.detectAndDecode(gray)
        if data:
            return {"text": data}

        raise HTTPException(status_code=404, detail="No QR found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Run locally: uvicorn websitee.python_decoder.server:app --host 0.0.0.0 --port 8000



