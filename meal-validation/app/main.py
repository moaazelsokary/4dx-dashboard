"""
MEAL upload validation API — stateless, ephemeral file handling.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

VENDOR_DIR = Path(__file__).resolve().parent.parent / "vendor"
sys.path.insert(0, str(VENDOR_DIR))

from volunteer_upload_validation import (  # noqa: E402
    VALIDATION_ENGINE_VERSION,
    validate_volunteer_upload,
)

MAX_BYTES = int(os.environ.get("MEAL_MAX_UPLOAD_BYTES", str(25 * 1024 * 1024)))
API_KEY = os.environ.get("MEAL_VALIDATION_API_KEY", "").strip()
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "MEAL_CORS_ORIGINS",
        "http://localhost:8080,http://127.0.0.1:8080,https://lifemakers.netlify.app",
    ).split(",")
    if o.strip()
]

app = FastAPI(title="MEAL Validation API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


def _check_api_key(x_meal_api_key: str | None) -> None:
    if not API_KEY:
        return
    if not x_meal_api_key or x_meal_api_key.strip() != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")


def _json_safe(obj: Any) -> Any:
    """Convert numpy/pandas types for JSON response."""
    if obj is None or isinstance(obj, (str, int, float, bool)):
        return obj
    if isinstance(obj, dict):
        return {str(k): _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_safe(x) for x in obj]
    if hasattr(obj, "item"):
        try:
            return obj.item()
        except Exception:
            pass
    if hasattr(obj, "isoformat"):
        return obj.isoformat()
    return str(obj)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "engine_version": VALIDATION_ENGINE_VERSION}


@app.post("/api/meal/validate")
async def validate_upload(
    file: UploadFile = File(...),
    sheet_name: str | None = Form(None),
    validate_mode: str = Form("both"),
    x_meal_api_key: str | None = Header(None, alias="X-Meal-Api-Key"),
) -> dict[str, Any]:
    _check_api_key(x_meal_api_key)

    name = (file.filename or "").lower()
    if not (name.endswith(".xlsx") or name.endswith(".xls")):
        raise HTTPException(status_code=422, detail="Only .xlsx or .xls files are supported")

    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail=f"File exceeds {MAX_BYTES // (1024 * 1024)} MB limit")
    if len(data) == 0:
        raise HTTPException(status_code=422, detail="Empty file")

    suffix = ".xlsx" if name.endswith(".xlsx") else ".xls"
    tmp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(data)
            tmp_path = tmp.name

        result = validate_volunteer_upload(
            tmp_path,
            sheet_name=sheet_name.strip() if sheet_name and sheet_name.strip() else None,
            validate_mode=validate_mode,
        )
        return _json_safe(result)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Validation failed: {exc}") from exc
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8090"))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)
