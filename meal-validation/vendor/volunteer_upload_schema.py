"""
مخطط أعمدة الرفع: مطابقة أسماء الشيت مع القالب قبل التحقق على الصفوف.

يُحمَّل ``volunteer_validation_schema.json`` (أو مسار تختاره). يمكن ربط كل حقل
بـ ``merge_aliases_from_json_keys`` لدمج مرادفات من ``column_aliases.json``،
إضافة إلى مرادفات أعمدة الخدمات المستوحاة من ``services_code.standardize_services_sheet_columns``.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pandas as pd

_SCHEMA_PATH_DEFAULT = Path(__file__).resolve().parent / "volunteer_validation_schema.json"
_COLUMN_ALIASES_PATH = Path(__file__).resolve().parent / "column_aliases.json"

# مرادفات «نوع الخدمة» من services_code.standardize_services_sheet_columns (Product)
_SERVICE_PRODUCT_ALIASES: list[str] = [
    "Product",
    "service",
    "service type",
    "product",
    "type",
    "product name",
    "service name",
    "الخدمه",
    "الخدمة",
    "خدمة",
    "خدمه",
    "نوع الخدمه",
    "نوع الخدمة",
    "اسم الخدمه",
    "اسم الخدمة",
    "المنتج",
    "منتج",
    "نوع المنتج",
    "اسم المنتج",
    "صنف",
    "البند",
    "بند الخدمة",
    "بند الخدمه",
    "Service 1",
    "Service 1 - الخدمة الاولي",
    "Service 1 - الخدمة الأولى",
]

_SERVICE_AMOUNT_ALIASES: list[str] = [
    "Actual Amount",
    "actual amount",
    "amount",
    "cost",
    "paid amount",
    "actual_amount",
    "قيمه الدعم",
    "قيمة الدعم",
    "المبلغ",
    "المبلغ الفعلي",
    "اجمالي الدعم",
    "إجمالي الدعم",
    "Amount",
    "Amount - تكلفة التنفيذ",
]

_SERVICE_ACTUAL_DATE_ALIASES: list[str] = [
    "Actual Date",
    "end date",
    "implementation date",
    "service actual date",
    "actual_date",
    "تاريخ التنفيذ الفعلي",
    "تاريخ التنفيذ",
    "التاريخ الفعلي",
    "Actual Date - تاريخ التنفيذ",
]

_SERVICE_EXPECTED_DATE_ALIASES: list[str] = [
    "Expected Date",
    "start date",
    "planned date",
    "service expected date",
    "expected_date",
    "تاريخ التنفيذ المتوقع",
    "التاريخ المتوقع",
    "تاريخ متوقع",
]


def normalize_column_name(col_name) -> str:
    """مثل services_code.normalize_column_name."""
    if pd.isna(col_name):
        return ""
    normalized = str(col_name).strip().lower()
    normalized = normalized.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا")
    normalized = normalized.replace("ؤ", "و").replace("ئ", "ي").replace("ة", "ه")
    normalized = re.sub(r"[^\w\s/]", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def _load_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f) or {}
    except Exception:
        return {}


def _unique_preserve(seq: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for x in seq:
        if not x or not str(x).strip():
            continue
        s = str(x).strip()
        if s in seen:
            continue
        seen.add(s)
        out.append(s)
    return out


def load_volunteer_schema(schema_path: str | Path | None = None) -> dict[str, Any]:
    path = Path(schema_path) if schema_path else _SCHEMA_PATH_DEFAULT
    data = _load_json(path)
    if not data.get("columns"):
        return {"columns": [], "merge_column_aliases_json": False}
    return data


def _alias_indicates_personal_or_individual_id(n: str, s: str) -> bool:
    """عنوان مركّب يعبّر عن الرقم الشخصي / الهوية الفردية (حتى لو ذكر الباسبور معه)."""
    if "الرقم الشخصي" in s or "الرقم الشخصي" in n or "الرقم الشخصى" in s:
        return True
    if "individual" in n or "personal identification" in n or "personal id" in n:
        return True
    if "pid" in n.split():
        return True
    if "id number" in n or "رقم الهويه" in n or "رقم الهوية" in n:
        return True
    if "رقم شخصي" in s or "رقم شخصي" in n:
        return True
    return False


def _alias_strongly_passport(label: str) -> bool:
    """
    مرادفات «جواز فقط» لا تُدمج كمعرّف فردي؛ أما العناوين المركّبة
    (الرقم الشخصي + باسبور + individual number …) فتُحتفَظ بها.
    """
    if not label or pd.isna(label):
        return False
    s = str(label)
    n = normalize_column_name(s)
    has_passport_word = "passport" in n or "باسبور" in s or "جواز" in s
    if not has_passport_word:
        return False
    if _alias_indicates_personal_or_individual_id(n, s):
        return False
    return True


def _expand_column_def(col_def: dict[str, Any], column_aliases_root: dict[str, Any]) -> dict[str, Any]:
    """يدمج match_names مع column_aliases.json حسب المفاتيح."""
    names = list(col_def.get("match_names") or [])
    sid = col_def.get("id")
    keys = col_def.get("merge_aliases_from_json_keys") or []
    if col_def.get("merge_aliases_from_json_keys") is None and column_aliases_root:
        # دعم اسم قديم: حقل واحد
        single = col_def.get("merge_aliases_from_json_key")
        if single:
            keys = [single]

    for k in keys:
        extra = column_aliases_root.get(k)
        if isinstance(extra, list):
            for x in extra:
                xs = str(x)
                if sid in ("individual_id", "personal_identification_number") and _alias_strongly_passport(xs):
                    continue
                names.append(xs)
    if sid == "service_1":
        names.extend(_SERVICE_PRODUCT_ALIASES)
    elif sid == "amount":
        names.extend(_SERVICE_AMOUNT_ALIASES)
    elif sid == "actual_date":
        names.extend(_SERVICE_ACTUAL_DATE_ALIASES)
    elif sid == "expected_date":
        names.extend(_SERVICE_EXPECTED_DATE_ALIASES)

    official = col_def.get("official_header") or (names[0] if names else "")
    if official and official not in names:
        names.insert(0, official)

    col_def = {**col_def, "match_names": _unique_preserve(names), "official_header": official}
    return col_def


def prepare_schema(schema: dict[str, Any]) -> list[dict[str, Any]]:
    merge_root = {}
    if schema.get("merge_column_aliases_json", True):
        merge_root = _load_json(_COLUMN_ALIASES_PATH)

    columns = []
    for c in schema.get("columns") or []:
        if not isinstance(c, dict):
            continue
        columns.append(_expand_column_def(dict(c), merge_root))
    return columns


def apply_volunteer_column_schema(
    df: pd.DataFrame,
    schema_path: str | Path | None = None,
) -> tuple[pd.DataFrame, list[dict[str, Any]], dict[str, Any]]:
    """
    يطابق أعمدة ``df`` مع القالب ويعيد اسماء رسمية موحّدة.

    يُرجع:
    - DataFrame بعد إعادة التسمية
    - قائمة عناصر ``missing_required`` (كل عنصر dict لوصف الحقل الناقص)
    - metadata: rename_map، الأعمدة الأصلية، إلخ.
    """
    schema = load_volunteer_schema(schema_path)
    column_defs = prepare_schema(schema)

    if not column_defs:
        return df.copy(), [], {"rename_map": {}, "skipped": True}

    df_work = df.copy()
    taken_cols: set[str] = set()
    rename_map: dict[str, str] = {}

    for col_def in column_defs:
        official = col_def.get("official_header") or ""
        if not official:
            continue
        alias_norms = {normalize_column_name(x) for x in col_def.get("match_names") or []}
        alias_norms.discard("")

        matched_col = None
        for col in df_work.columns:
            if col in taken_cols:
                continue
            if normalize_column_name(col) in alias_norms:
                matched_col = col
                break

        if matched_col is not None:
            taken_cols.add(matched_col)
            if matched_col != official:
                rename_map[matched_col] = official

    df_renamed = df_work.rename(columns=rename_map)

    missing: list[dict[str, Any]] = []
    for col_def in column_defs:
        if not col_def.get("required"):
            continue
        official = col_def.get("official_header") or ""
        if not official:
            continue
        if official not in df_renamed.columns:
            missing.append(
                {
                    "field_id": col_def.get("id", ""),
                    "official_header": official,
                    "labels_ar": col_def.get("labels_ar", official),
                    "labels_en": col_def.get("labels_en", official),
                    "match_names_sample": (col_def.get("match_names") or [])[:8],
                }
            )

    meta: dict[str, Any] = {
        "rename_map": rename_map,
        "original_columns": list(df.columns),
        "columns_after_rename": list(df_renamed.columns),
        "schema_path": str(Path(schema_path or _SCHEMA_PATH_DEFAULT).resolve()),
    }
    return df_renamed, missing, meta