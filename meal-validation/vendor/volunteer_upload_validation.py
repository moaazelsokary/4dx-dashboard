"""
تحقق من شيت واحد (cases + services) قبل رفع Odoo — مناسب لموقع المتطوعين.

الترتيب اللي وصفته:
1) رفع الشيت → رسائل أخطاء (تليفون، تكرار صفوف، IDs، خدمات ناقصة، …)
2) المتطوع يصلّح ويعيد الرفع حتى يصفر الأخطاء
3) بعدها خطوة منفصلة: external_id ورفع Odoo

لا يتصل بـ Odoo ولا يقرأ Sources.xlsx — تحقق فقط على بيانات الملف المرفوع.

ملاحظة للـ Terminal على Windows: العربي غالباً يظهر مشوّش؛ استخدم ``messages_en`` أو ملف
``validation_report_ar.txt`` (UTF-8) الذي يُنشأ عند التشغيل كسكربت.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
import numpy as np
import pandas as pd


def _configure_stdio_utf8_windows() -> None:
    if os.name == "nt":
        os.system("chcp 65001 > nul")
        try:
            sys.stdout.reconfigure(encoding="utf-8")
            sys.stderr.reconfigure(encoding="utf-8")
        except Exception:
            pass

from combined_sheet_split import (
    load_cases_and_services_frames,
    looks_like_nrc_wide_case_plus_service,
    split_nrc_cash_assistance_wide,
)


def clean_id(x) -> str | None:
    if pd.isna(x):
        return None
    return str(x).strip().replace(".0", "").replace(" ", "")


def _is_blank(val) -> bool:
    if pd.isna(val):
        return True
    s = str(val).strip().lower()
    return s == "" or s in ("nan", "none")


def _parse_positive_amount(val) -> tuple[float | None, str]:
    """
    يُرجع (قيمة، حالة): حالة = ok | empty | invalid | not_positive
    """
    if _is_blank(val):
        return None, "empty"
    s = (
        str(val)
        .strip()
        .replace(",", "")
        .replace("٬", "")
        .replace("\u00a0", "")
    )
    num = pd.to_numeric(s, errors="coerce")
    if pd.isna(num):
        return None, "invalid"
    num_f = float(num)
    if num_f <= 0:
        return num_f, "not_positive"
    return num_f, "ok"


def _parse_date_cell(val):
    """pandas Timestamp أو None لو فاضي أو غير قابل للتحويل."""
    if _is_blank(val):
        return None
    if isinstance(val, pd.Timestamp):
        return val if pd.notna(val) else None
    dt = pd.to_datetime(val, dayfirst=True, errors="coerce")
    return None if pd.isna(dt) else dt


def _find_is_refugees_column(df: pd.DataFrame) -> str | None:
    if "IsRefugees" in df.columns:
        return "IsRefugees"
    for c in df.columns:
        key = str(c).replace(" ", "").replace("_", "").lower()
        if key in ("isrefugees", "isreefuges", "refugees"):
            return c
    return None


def _classify_is_refugees(val) -> str:
    """
    yes | no إذا القيمة معروفة، أو empty | invalid.
    يقبل إنجليزي وعربي شائع في الشيتات.
    """
    if _is_blank(val):
        return "empty"
    raw = str(val).strip()
    low = raw.lower()
    if low in ("yes", "y", "true", "1", "نعم"):
        return "yes"
    if low in ("no", "n", "false", "0", "لا", "لأ"):
        return "no"
    ar = (
        raw.replace("أ", "ا")
        .replace("إ", "ا")
        .replace("آ", "ا")
        .replace("ى", "ي")
        .strip()
    )
    if ar in ("نعم", "موافق"):
        return "yes"
    if ar in ("لا", "لأ", "لاء"):
        return "no"
    return "invalid"


def phone_is_valid_egyptian(phone_raw) -> tuple[bool, str | None]:
    if pd.isna(phone_raw) or _is_blank(phone_raw):
        return True, None

    phone = clean_id(phone_raw)
    if phone is None:
        return True, None

    if phone.startswith("+20"):
        phone = phone[3:]
    if phone.startswith("20"):
        phone = phone[1:]

    if len(phone) == 10 and phone.isdigit():
        phone = "0" + phone

    if len(phone) == 11 and phone.startswith("0") and phone.isdigit():
        return True, phone

    return False, phone


@dataclass
class ValidationIssue:
    severity: str  # "error" | "warning"
    code: str
    message_ar: str
    """رسالة للواجهة العربية (متصفح / ملف UTF-8) — تجنب الاعتماد على كونسول Windows."""
    message_en: str
    """رسالة إنجليزية واضحة لـ CMD/PowerShell ولـ JSON."""
    excel_row: int | None
    row_index: int | None
    column: str | None = None
    identifiers: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "severity": self.severity,
            "code": self.code,
            "message_ar": self.message_ar,
            "message_en": self.message_en,
            "excel_row": self.excel_row,
            "row_index": self.row_index,
            "column": self.column,
            "identifiers": self.identifiers,
        }

def _normalize_frames_for_validation(
    cases_df: pd.DataFrame,
    services_df: pd.DataFrame,
    *,
    header_rows: int = 1,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """إضافة `_excel_row` وترقيم موضعي لتفادي لبس الفهرس."""
    c = cases_df.copy().reset_index(drop=True)
    c["_excel_row"] = c.index + header_rows + 1

    if services_df is None or services_df.empty:
        return c, services_df.iloc[0:0].copy() if services_df is not None else pd.DataFrame()

    orig_ix = np.asarray(services_df.index)
    s = services_df.copy().reset_index(drop=True)
    try:
        s["_excel_row"] = orig_ix.astype(np.int64) + header_rows + 1
    except (ValueError, TypeError):
        # فهرس غير رقمي — احتياط
        s["_excel_row"] = np.arange(len(s), dtype=np.int64) + header_rows + 1

    return c, s


def _norm_header_label(col) -> str:
    return str(col).strip().lower().replace("_", " ")


def _resolve_personal_id_column(df: pd.DataFrame) -> str | None:
    """أقرب عمود للرقم الشخصي بأسماء القالب أو NRC أو بعد التوحيد."""
    if df is None or df.empty:
        return None
    if "personal_identification_number" in df.columns:
        return "personal_identification_number"
    for c in df.columns:
        if str(c).startswith("_"):
            continue
        n = _norm_header_label(c)
        if "passport" in n:
            continue
        if "personal identification number" in n:
            return c
        if "individual" in n and "id" in n:
            return c
        if "personal" in n and "identification" in n:
            return c
    return None


def _resolve_national_id_column(df: pd.DataFrame) -> str | None:
    """أقرب عمود للرقم القومي."""
    if df is None or df.empty:
        return None
    if "national_id" in df.columns:
        return "national_id"
    for c in df.columns:
        if str(c).startswith("_"):
            continue
        sc = str(c)
        if "passport" in _norm_header_label(c):
            continue
        if "قومي" in sc:
            return c
        n = _norm_header_label(c)
        if "nationa id" in n or ("national" in n and "id" in n and "individual" not in n):
            return c
    return None


def _resolve_passport_column(df: pd.DataFrame) -> str | None:
    if df is None or df.empty:
        return None
    if "Passport Number" in df.columns:
        return "Passport Number"
    if "passport_number" in df.columns:
        return "passport_number"
    for c in df.columns:
        if str(c).startswith("_"):
            continue
        if "passport" in _norm_header_label(c):
            return c
    return None


ValidateMode = str  # both | cases | services

# يظهر في /health ونتيجة التحقق — للتأكد أن الخادم يشغّل آخر نسخة
VALIDATION_ENGINE_VERSION = "2026-05-20-report-order-v2"


def _normalize_validate_mode(mode: str | None) -> str:
    m = (mode or "both").strip().lower()
    if m in ("cases", "case", "cases_only", "cases-only"):
        return "cases"
    if m in ("services", "service", "services_only", "services-only"):
        return "services"
    return "both"


def _is_case_demographic_column(col: str) -> bool:
    """
    أعمدة بيانات الحالة/المستفيد — لا تُدرج في تقرير تحقق «الخدمات فقط».
    """
    nl = _norm_header_label(col).replace("-", " ")
    compact = nl.replace(" ", "")
    if "isrefugees" in compact or nl == "refugees":
        return True
    if "nationality" in nl or "الجنسية" in col:
        return True
    if "phone" in nl and "product" not in nl:
        return True
    if "bod" in nl or "تاريخ الميلاد" in col or "birth" in nl:
        return True
    if nl == "age" or "السن" in col:
        return True
    if "gender" in nl or "النوع الاجتماعي" in col or "social type" in nl:
        return True
    if "education" in nl or "الشهادة" in col:
        return True
    if "social status" in nl or "الوضع الاجتماعي" in col:
        return True
    if "family member" in nl or "افراد الاسرة" in col or "أفراد الاسرة" in col:
        return True
    if nl == "state" or "المحافظة" in col:
        return True
    if nl == "zone" or "المدينة" in col:
        return True
    if "street" in nl or "العنوان" in col:
        return True
    if nl == "name" or col.strip().lower() == "name":
        return True
    return False


def _is_service_column(col: str) -> bool:
    nl = _norm_header_label(col).replace("-", " ")
    if col in ("Product", "Actual Amount", "Actual Date", "Expected Date"):
        return True
    if "product" in nl and "category" not in nl:
        return True
    if "actual amount" in nl or "expected amount" in nl:
        return True
    if "actual date" in nl or "expected date" in nl:
        return True
    if "service" in nl and "product" in nl:
        return True
    return False


def _dual_pin_passport_blank_stats(df: pd.DataFrame) -> dict[str, Any] | None:
    """
    صفوف بدون رقم شخصي **و** بدون جواز سفر معاً (معرّفان أساسيان).
    """
    if df is None or df.empty or "_excel_row" not in df.columns:
        return None
    pin_col = _resolve_personal_id_column(df)
    pass_col = _resolve_passport_column(df)
    if not pin_col and not pass_col:
        return None
    n = len(df)
    dual_blank_rows: list[int] = []
    for pos in range(n):
        pin_blank = True
        pass_blank = True
        if pin_col:
            pin_blank = not bool(clean_id(df.iloc[pos][pin_col]))
        if pass_col:
            pass_blank = not bool(clean_id(df.iloc[pos][pass_col]))
        if pin_blank and pass_blank:
            dual_blank_rows.append(int(df.at[pos, "_excel_row"]))
    dual_blank_rows = sorted(set(dual_blank_rows))
    return {
        "personal_id_column": pin_col,
        "passport_column": pass_col,
        "row_count": n,
        "dual_blank_count": len(dual_blank_rows),
        "dual_blank_excel_rows": dual_blank_rows,
        "dual_blank_excel_rows_sample": dual_blank_rows[:45],
        "sample_truncated": len(dual_blank_rows) > 45,
    }


def _format_identifier_dual_blank_preamble_ar_en(
    stats: dict[str, Any] | None,
) -> tuple[list[str], list[str]]:
    if not stats or int(stats.get("dual_blank_count") or 0) <= 0:
        return [], []
    n = int(stats.get("row_count") or 0)
    bn = int(stats["dual_blank_count"])
    pct = (100.0 * bn / n) if n else 0.0
    pin_lbl = stats.get("personal_id_column") or "personal_identification_number"
    pass_lbl = stats.get("passport_column") or "Passport Number"
    ar = [
        "▌ معرّف المستفيد — الرقم الشخصي وجواز السفر معاً",
        (
            f"  [فراغات] {bn} صفاً بدون «{pin_lbl}» ولا «{pass_lbl}» معاً "
            f"من أصل {n} صفاً تقريباً ({pct:.1f}%)."
        ),
    ]
    en = [
        "▌ Beneficiary ID — both personal ID and passport empty",
        (
            f"  [BLANKS] {bn} row(s) with both {pin_lbl!r} and {pass_lbl!r} empty "
            f"(~{n} rows, {pct:.1f}%)."
        ),
    ]
    sample = stats.get("dual_blank_excel_rows_sample") or []
    if sample:
        extra = ""
        if stats.get("sample_truncated"):
            extra = f" … (+{bn - len(sample)} more)"
        ar.append(f"  [فراغات] أمثلة صفوف Excel: {sample}{extra}.")
        en.append(f"  [BLANKS] Sample Excel rows: {sample}{extra}.")
    return ar, en


def _resolve_phone_column(df: pd.DataFrame) -> str | None:
    """عمود التليفون الأساسي بعد أسماء القالب (ليس عمود البديل)."""
    if df is None or df.empty:
        return None
    if "phone" in df.columns:
        return "phone"
    for c in df.columns:
        sc = str(c)
        if sc.startswith("_"):
            continue
        if "بديل" in sc:
            continue
        n = _norm_header_label(c).replace("-", " ")
        compact = n.replace(" ", "")
        if "phone_alt" in compact or "phonenumberalt" in compact:
            continue
        if "alternate" in n and "phone" in n:
            continue
        if "phone" in n:
            return sc
    return None


def _resolve_phone_alt_column(df: pd.DataFrame) -> str | None:
    """عمود التليفون البديل (مرادفات + كلمة بديل في العنوان)."""
    if df is None or df.empty:
        return None
    if "phone_alt" in df.columns:
        return "phone_alt"
    for c in df.columns:
        sc = str(c)
        if sc.startswith("_"):
            continue
        n = _norm_header_label(c).replace("-", " ")
        compact = n.replace(" ", "")
        if "بديل" in sc or "phone_alt" in compact:
            return sc
        if "phone" in n and (" alt" in f" {n} " or n.endswith(" alt") or "alternate" in n):
            return sc
    return None


def _attach_excel_row_numbers(df: pd.DataFrame, header_rows: int) -> pd.DataFrame:
    out = df.copy().reset_index(drop=True)
    out["_excel_row"] = out.index + header_rows + 1
    return out


def _duplicate_cleaned_values_in_column(
    df: pd.DataFrame,
    col: str | None,
    *,
    max_groups: int = 80,
) -> tuple[list[dict[str, Any]], str | None]:
    """
    قيم غير فارغة تكرّرت في أكثر من صف (بعد clean_id).
    يُرجع (تفاصيل، اسم العمود الفعلي أو None).
    """
    if df is None or df.empty or "_excel_row" not in df.columns:
        return [], None
    if not col or col not in df.columns:
        return [], col

    positions_by_val: dict[str, list[int]] = {}
    for pos in range(len(df)):
        raw = df.iloc[pos][col]
        vid = clean_id(raw)
        if not vid:
            continue
        positions_by_val.setdefault(str(vid), []).append(pos)

    details: list[dict[str, Any]] = []
    for vid, positions in positions_by_val.items():
        if len(positions) < 2:
            continue
        excel_rows = sorted({int(df.at[p, "_excel_row"]) for p in positions})
        details.append(
            {
                "value": vid,
                "occurrences": len(positions),
                "excel_rows": excel_rows,
            }
        )
    details.sort(key=lambda x: (-x["occurrences"], x["value"]))
    return details[:max_groups], col


def _series_blank_mask(s: pd.Series) -> pd.Series:
    """يفرّق بين الخلية الفارغة وسلسلة النصوص 'nan'/'none' مثل باقي التحقق."""
    if s is None or len(s) == 0:
        return pd.Series(dtype=bool)
    t = s.astype(str).str.strip().str.lower()
    return s.isna() | t.eq("") | t.isin(("nan", "none"))


# أسماء/أجزاء من العناوين غالباً اختيارية أو يكون فيها فراغ كثير — نعرضها في كتلة تجميعية مضغوطة
_NULL_AGGREGATE_COLUMN_HINTS: tuple[str, ...] = (
    "interview",
    "referral",
    "passport",
    "interval",
    "bod",
    "family",
    "phone_alt",
    "education type",
    "social status",
    "street",
    "zone",
    "quantity",
    "expected_amount",
    "product_category",
    "isrefugee",
    "refugee",
)


def _column_eligible_for_sparse_null_aggregate(
    col_name: str,
    blank_count: int,
    n_rows: int,
) -> bool:
    """أعمدة «كثيرة الفراغ»: بالاسم أو بنسبة/عدد الفراغات."""
    if n_rows <= 0:
        return False
    nl = _norm_header_label(col_name).replace("-", " ")
    for hint in _NULL_AGGREGATE_COLUMN_HINTS:
        if hint in nl:
            return True
    ratio = blank_count / n_rows
    if ratio >= 0.28:
        return True
    if blank_count >= max(35, int(0.12 * n_rows)):
        return True
    return False


def _null_detail_column_show_excel_rows(column_name: str) -> bool:
    """في قسم التفصيل: نعرض أرقام صفوف Excel للفراغات في أعمدة المعرف والتليفون والقومي."""
    c = str(column_name)
    raw = c.lower().replace("_", " ")
    nl = _norm_header_label(c).replace("-", " ")
    if "passport" in nl:
        return False
    if "phone_alt" in raw.replace(" ", "") or "بديل" in c:
        return False
    if "phone" in nl:
        return True
    if "individual" in nl and "id" in nl:
        return True
    if "personal" in nl and "identification" in nl:
        return True
    if "قومي" in c:
        return True
    if "national" in nl and "id" in nl:
        return True
    return False


def _partition_null_details_by_aggregate(
    details: list[dict[str, Any]],
    n_rows: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    agg: list[dict[str, Any]] = []
    det: list[dict[str, Any]] = []
    for r in details:
        if _column_eligible_for_sparse_null_aggregate(r["column"], r["blank_count"], n_rows):
            agg.append(r)
        else:
            det.append(r)
    agg.sort(key=lambda x: (-x["blank_count"], str(x["column"])))
    det.sort(key=lambda x: (-x["blank_count"], str(x["column"])))
    return agg, det


def _column_null_details(df: pd.DataFrame, *, max_sample_rows: int = 45) -> list[dict[str, Any]]:
    """أعمدة فيها على الأقل خلية فارغة مع عدّها وعيّنة من صفوف Excel."""
    if df is None or df.empty or "_excel_row" not in df.columns:
        return []
    out: list[dict[str, Any]] = []
    for col in df.columns:
        if col == "_excel_row":
            continue
        mask = _series_blank_mask(df[col])
        n = int(mask.sum())
        if n == 0:
            continue
        rows = sorted({int(x) for x in df.loc[mask, "_excel_row"].tolist()})
        sample = rows[:max_sample_rows]
        out.append(
            {
                "column": col,
                "blank_count": n,
                "excel_rows_all": rows,
                "excel_rows_sample": sample,
                "truncated": len(rows) > len(sample),
            }
        )
    out.sort(key=lambda x: (-x["blank_count"], str(x["column"])))
    return out


def _duplicate_beneficiary_details(cases_df: pd.DataFrame) -> list[dict[str, Any]]:
    """مجموعات معرّف مستفيد ظهرت في أكثر من صف."""
    if cases_df is None or cases_df.empty or "_excel_row" not in cases_df.columns:
        return []

    pin_col = _resolve_personal_id_column(cases_df)
    nat_col = _resolve_national_id_column(cases_df)

    pids = cases_df[pin_col].map(clean_id) if pin_col else pd.Series([None] * len(cases_df))
    nids = cases_df[nat_col].map(clean_id) if nat_col else pd.Series([None] * len(cases_df))

    key_positions: dict[tuple[str, str], list[int]] = {}
    for pos in range(len(cases_df)):
        pv = pids.iloc[pos]
        nv = nids.iloc[pos]
        key = ("p", pv) if pv else ("n", nv) if nv else None
        if key is None:
            continue
        key_positions.setdefault(key, []).append(pos)

    details: list[dict[str, Any]] = []
    for key, positions in key_positions.items():
        if len(positions) < 2:
            continue
        excel_rows = sorted({int(cases_df.at[p, "_excel_row"]) for p in positions})
        details.append(
            {
                "key_type": key[0],
                "id_value": key[1],
                "duplicate_row_count": len(positions),
                "excel_rows": excel_rows,
            }
        )
    details.sort(key=lambda x: (-x["duplicate_row_count"], str(x["id_value"])))
    return details


def _duplicate_service_details(services_df: pd.DataFrame) -> list[dict[str, Any]]:
    """نفس الخدمة لنفس المعرّف في أكثر من صف."""
    if services_df is None or services_df.empty or "_excel_row" not in services_df.columns:
        return []

    id_col = "Individual ID/National ID"
    prod_col = "Product"
    if id_col not in services_df.columns or prod_col not in services_df.columns:
        return []

    tmp = services_df.copy()
    tmp["_oid"] = tmp[id_col].map(clean_id) if id_col in tmp.columns else ""
    tmp["_pc"] = tmp[prod_col].astype(str).str.strip().str.lower()
    tmp = tmp[tmp["_oid"].astype(str).str.len() > 0]
    tmp = tmp[tmp["_pc"].ne("") & tmp["_pc"].ne("nan")]

    details: list[dict[str, Any]] = []
    for (_oid, _pc), grp in tmp.groupby(["_oid", "_pc"], sort=False):
        if len(grp) < 2:
            continue
        excel_rows = sorted({int(x) for x in grp["_excel_row"].tolist()})
        details.append(
            {
                "person_id": _oid,
                "product": _pc,
                "duplicate_row_count": len(grp),
                "excel_rows": excel_rows,
            }
        )
    details.sort(key=lambda x: (-x["duplicate_row_count"], str(x["person_id"]), str(x["product"])))
    return details


def _dataframe_for_null_report(df: pd.DataFrame | None, validate_mode: str) -> pd.DataFrame:
    """يحذف أعمدة الحالة من تقرير فراغات الخدمات عند validate_mode=services."""
    if df is None or df.empty:
        return df if df is not None else pd.DataFrame()
    mode = _normalize_validate_mode(validate_mode)
    if mode != "services":
        return df
    keep = [
        c
        for c in df.columns
        if str(c) == "_excel_row" or not _is_case_demographic_column(str(c))
    ]
    if not keep:
        return df.iloc[0:0].copy()
    return df[keep].copy()


def _format_null_summary_ar_en(
    cases_df: pd.DataFrame,
    services_df: pd.DataFrame,
    *,
    preamble_ar: str = "",
    preamble_en: str = "",
) -> tuple[str, str, dict[str, Any]]:
    """
    يبني بيانات الفراغات لـ ``data_quality`` ولتقرير الأعمدة؛ لا يُنتج نصاً للعرض
    (تفاصيل الفراغات مدمجة في ``messages_*`` المرتبة بالعمود).
    ``preamble_*`` تُحفَظ للتوافق مع الاستدعاءات القديمة ولا تُستخدم.
    """
    _ = (preamble_ar, preamble_en)
    c_details = _column_null_details(cases_df)
    s_details = _column_null_details(services_df)

    n_c = len(cases_df) if cases_df is not None and not cases_df.empty else 0
    n_s = len(services_df) if services_df is not None and not services_df.empty else 0

    agg_c, det_c = _partition_null_details_by_aggregate(c_details, n_c)
    agg_s, det_s = _partition_null_details_by_aggregate(s_details, n_s)

    # أعمدة ظهرت أصلاً في ملخص الحالات — لا نكرّرها تحت الخدمات (نفس الشيت المقسوم يكرّر الأعمدة المشتركة)
    case_column_names = {d["column"] for d in c_details}
    agg_s_emit = [r for r in agg_s if r["column"] not in case_column_names]
    det_s_emit = [r for r in det_s if r["column"] not in case_column_names]
    omitted_services_dup = sorted(
        ({d["column"] for d in s_details} & case_column_names)
    )

    meta: dict[str, Any] = {
        "cases": c_details,
        "services": s_details,
        "cases_null_aggregated": agg_c,
        "cases_null_detailed": det_c,
        "services_null_aggregated": agg_s_emit,
        "services_null_detailed": det_s_emit,
        "services_null_aggregated_raw": agg_s,
        "services_null_detailed_raw": det_s,
        "null_summary_services_columns_omitted_as_duplicate_of_cases": omitted_services_dup,
    }

    return "", "", meta


def _format_duplication_summary_ar_en(
    cases_df: pd.DataFrame,
    services_df: pd.DataFrame,
    *,
    preamble_ar: str = "",
    preamble_en: str = "",
) -> tuple[str, str, dict[str, Any]]:
    """
    يبني ``data_quality["duplicates"]`` فقط؛ لا يُنتج نص ملخص للعرض
    (تفاصيل التكرار في ``messages_*`` تحت الأعمدة).
    """
    _ = (preamble_ar, preamble_en)
    pid_col = _resolve_personal_id_column(cases_df)
    nid_col = _resolve_national_id_column(cases_df)
    pid_dups, pid_used = _duplicate_cleaned_values_in_column(cases_df, pid_col)
    nid_dups, nid_used = _duplicate_cleaned_values_in_column(cases_df, nid_col)
    b_dup = _duplicate_beneficiary_details(cases_df)
    s_dup = _duplicate_service_details(services_df)
    meta: dict[str, Any] = {
        "personal_id_column": pid_used,
        "duplicate_personal_id_values": pid_dups,
        "national_id_column": nid_used,
        "duplicate_national_id_values": nid_dups,
        "duplicate_beneficiary_groups": b_dup,
        "duplicate_service_groups": s_dup,
    }
    return "", "", meta


def _ordered_data_columns(
    cases_df: pd.DataFrame | None,
    services_df: pd.DataFrame | None,
) -> list[str]:
    """ترتيب أعمدة العرض: أعمدة جدول الحالات ثم أعمدة الخدمات (بدون أعمدة داخلية)."""
    out: list[str] = []
    seen: set[str] = set()

    def walk(df: pd.DataFrame | None) -> None:
        if df is None or df.empty:
            return
        for c in df.columns:
            sc = str(c)
            if sc == "_excel_row" or sc.startswith("_"):
                continue
            if sc not in seen:
                seen.add(sc)
                out.append(sc)

    walk(cases_df)
    walk(services_df)
    return out


def _merged_null_lookup(null_meta: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """
    دمج تفاصيل الفراغ من cases و services حسب اسم العمود.
    إذا وُجد نفس اسم العمود في الجدولين (بعد تقسيم الشيت الواحد)، نأخذ بيانات **الحالات فقط**
    حتى لا يُضاعَف العدد أو تُكرَّر الصفوف.
    """
    out: dict[str, dict[str, Any]] = {}
    case_rows = list(null_meta.get("cases") or [])
    service_rows = list(null_meta.get("services") or [])
    case_cols = {str(r.get("column", "")) for r in case_rows if r.get("column")}

    for r in case_rows:
        col = str(r.get("column", ""))
        if not col:
            continue
        if col not in out:
            out[col] = {"blank_count": 0, "excel_rows_all": []}
        o = out[col]
        o["blank_count"] += int(r.get("blank_count") or 0)
        o["excel_rows_all"].extend(list(r.get("excel_rows_all") or []))

    for r in service_rows:
        col = str(r.get("column", ""))
        if not col:
            continue
        if col in case_cols:
            continue
        if col not in out:
            out[col] = {"blank_count": 0, "excel_rows_all": []}
        o = out[col]
        o["blank_count"] += int(r.get("blank_count") or 0)
        o["excel_rows_all"].extend(list(r.get("excel_rows_all") or []))
    max_sample = 45
    for col, o in out.items():
        raw_rows = o["excel_rows_all"]
        rows_all: list[int] = []
        for x in raw_rows:
            try:
                rows_all.append(int(x))
            except (TypeError, ValueError):
                continue
        rows_all = sorted(set(rows_all))
        o["excel_rows_all"] = rows_all
        o["excel_rows_sample"] = rows_all[:max_sample]
        o["truncated"] = len(rows_all) > len(o["excel_rows_sample"])
    return out


def _baseline_rows_for_column(
    col: str,
    cases_df: pd.DataFrame | None,
    services_df: pd.DataFrame | None,
) -> int:
    if cases_df is not None and col in cases_df.columns:
        return len(cases_df)
    if services_df is not None and col in services_df.columns:
        return len(services_df)
    return max(
        len(cases_df) if cases_df is not None else 0,
        len(services_df) if services_df is not None else 0,
        1,
    )


def _issue_target_columns(
    issue: ValidationIssue,
    cases_df: pd.DataFrame,
    services_df: pd.DataFrame,
) -> list[str]:
    """أعمدة العرض التي يُسجَّل تحتها هذا الإشعار (قد يكون أكثر من عمود)."""
    code = issue.code
    ids = issue.identifiers or {}

    if code == "empty_sheet":
        return ["__general__"]
    if code == "missing_required_column":
        oh = ids.get("official_header") or issue.column
        return [str(oh or "__general__")]

    if code == "duplicate_beneficiary_rows":
        kt = ids.get("key_type")
        if kt == "p":
            c = _resolve_personal_id_column(cases_df)
            return [c] if c else ["personal_identification_number"]
        if kt == "n":
            c = _resolve_national_id_column(cases_df)
            return [c] if c else ["national_id"]
        return ["__identifiers__"]

    if code == "duplicate_service_same_person":
        # تكرار خدمة: يوضع تحت عمود المنتج لتفادي التكرار في القائمة
        if services_df is not None and "Product" in services_df.columns:
            return ["Product"]
        return ["__services__"]

    col = issue.column
    if not col:
        return ["__general__"]

    s = str(col)
    low = s.lower()
    if "personal_identification_number" in low and "national_id" in low:
        targets: list[str] = []
        if cases_df is not None:
            pc = _resolve_personal_id_column(cases_df)
            nc = _resolve_national_id_column(cases_df)
            if pc:
                targets.append(pc)
            if nc:
                targets.append(nc)
        return targets if targets else [s]
    return [s]


def _person_id_suffix(ids: dict[str, Any]) -> tuple[str, str]:
    """ذيل عربي/إنجليزي بمعرّف الصف (رقم شخصي و/أو قومي) لربط الخطأ بالمستفيد."""
    pin = ids.get("personal_identification_number")
    nat = ids.get("national_id")
    pin_s = None if pin is None or str(pin).strip() == "" else str(pin).strip()
    nat_s = None if nat is None or str(nat).strip() == "" else str(nat).strip()
    if not pin_s and not nat_s:
        return (
            " | معرّف الصف: لا رقم شخصي ولا قومي في الصف",
            " | row IDs: no PIN nor national ID",
        )
    ar_bits: list[str] = []
    en_bits: list[str] = []
    if pin_s:
        ar_bits.append(f"شخصي «{pin_s}»")
        en_bits.append(f"PIN={pin_s!r}")
    if nat_s:
        ar_bits.append(f"قومي «{nat_s}»")
        en_bits.append(f"NAT={nat_s!r}")
    return " | " + "، ".join(ar_bits), " | " + ", ".join(en_bits)


_ISSUE_TAG_BLANKS_CODES: frozenset[str] = frozenset(
    {
        "empty_sheet",
        "missing_identifier",
        "missing_name",
        "missing_phone",
        "missing_state",
        "missing_nationality",
        "missing_is_refugees",
        "service_missing_person_id",
        "service_missing_product",
        "missing_actual_amount",
        "missing_actual_date",
        "missing_expected_date",
    }
)
_ISSUE_TAG_NOT_FOUND_CODES: frozenset[str] = frozenset({"missing_required_column"})
_ISSUE_TAG_DUPLICATION_CODES: frozenset[str] = frozenset(
    {
        "duplicate_beneficiary_rows",
        "duplicate_service_same_person",
    }
)


def _issue_report_tag_pair(code: str) -> tuple[str, str]:
    """وسوم سطر التقرير حسب نوع المشكلة (عربي / إنجليزي)."""
    if code in _ISSUE_TAG_NOT_FOUND_CODES:
        return "غير موجود", "NOT_FOUND"
    if code in _ISSUE_TAG_BLANKS_CODES:
        return "فراغات", "BLANKS"
    if code in _ISSUE_TAG_DUPLICATION_CODES:
        return "تكرار", "DUPLICATION"
    return "قيمة خاطئة", "WRONG"


def _issue_row_id_suffix(issue: ValidationIssue) -> tuple[str, str]:
    """معرّف الصف/المستفيد للربط مع سطر التقرير (لا يُكرّر مع duplicate_beneficiary إن كان واضحاً في النص)."""
    ids = issue.identifiers or {}
    code = issue.code

    if code == "missing_required_column":
        return "", ""

    if code == "duplicate_beneficiary_rows":
        iv = ids.get("id_value")
        kt = ids.get("key_type")
        cnt = ids.get("duplicate_row_count")
        if iv is not None and str(iv).strip():
            vs = str(iv).strip()
            ktar = "شخصي" if kt == "p" else ("قومي" if kt == "n" else str(kt))
            ar = f" | المستفيد ({ktar}): «{vs}»"
            en = f" | beneficiary ({kt}): {vs!r}"
            if cnt is not None:
                ar += f" — متكررة {int(cnt)} مرات"
                en += f" — repeated {int(cnt)} times"
            return ar, en
        return "", ""

    if code == "duplicate_service_same_person":
        pk = ids.get("person_key")
        pr = ids.get("product")
        cnt = ids.get("duplicate_row_count")
        if pk is not None and str(pk).strip():
            ps = str(pk).strip()
            ar = f" | معرّف «{ps}»"
            en = f" | person_id={ps!r}"
            if pr is not None and str(pr).strip():
                prs = str(pr).strip()
                ar += f" — منتج «{prs}»"
                en += f", product={prs!r}"
            if cnt is not None:
                ar += f" — متكررة {int(cnt)} مرات"
                en += f" — repeated {int(cnt)} times"
            return ar, en
        return "", ""

    svc_id = ids.get("Individual ID/National ID")
    if svc_id is not None and str(svc_id).strip():
        s = str(svc_id).strip()
        return f" | ID صف الخدمة «{s}»", f" | service_row_id={s!r}"

    return _person_id_suffix(ids)


def _issue_value_labels(issue: ValidationIssue) -> tuple[str, str]:
    """مقتطف قيمة للعرض (عربي / إنجليزي) من identifiers حسب نوع الخطأ."""
    ids = issue.identifiers or {}
    code = issue.code

    def pick_raw() -> str:
        for k in ("raw_value", "phone_raw", "normalized"):
            v = ids.get(k)
            if v is not None and str(v).strip():
                return str(v).strip()
        return ""

    if code == "missing_phone":
        return "قيمة التليفون في الخلية: (فارغ)", "phone cell: (empty)"

    if code == "invalid_phone":
        raw = str(ids.get("phone_raw", "")).strip()
        norm = ids.get("phone_normalized_attempt")
        if raw:
            core_ar = f"القيمة في الخلية: «{raw}»"
            core_en = f"cell value={raw!r}"
            if norm is not None and str(norm).strip() and str(norm).strip() != raw:
                core_ar += f" — بعد التنظيف للتحقق: «{norm}»"
                core_en += f", cleaned={norm!r}"
            return core_ar, core_en
        return "قيمة غير صالحة في الخلية", "invalid cell value"

    if code == "invalid_phone_alt":
        v = pick_raw()
        if not v:
            v = str(ids.get("raw_value", "")).strip()
        if v:
            return f"قيمة البديل: «{v}»", f"alt value={v!r}"
        return "قيمة بديل غير صالحة", "invalid alt value"

    if code in (
        "invalid_actual_amount",
        "invalid_actual_date",
        "invalid_expected_date",
        "invalid_is_refugees",
    ):
        v = pick_raw()
        if v:
            return f"القيمة الخام: «{v}»", f"raw value: {v!r}"

    if code == "duplicate_beneficiary_rows":
        return "", ""

    if code == "duplicate_service_same_person":
        return "", ""

    if code == "name_short":
        return "الاسم أقل من 3 كلمات", "name has fewer than 3 words"

    if code in ("actual_amount_not_positive",):
        v = ids.get("amount")
        if v is not None:
            return f"المبلغ: {v}", f"amount: {v}"

    return "", ""


def _group_issues_by_column(
    issues: list[ValidationIssue],
    cases_df: pd.DataFrame,
    services_df: pd.DataFrame,
) -> dict[str, list[ValidationIssue]]:
    buckets: dict[str, list[ValidationIssue]] = {}
    for i in issues:
        for col in _issue_target_columns(i, cases_df, services_df):
            buckets.setdefault(col, []).append(i)
    for col in buckets:
        buckets[col].sort(
            key=lambda x: (
                x.excel_row is None,
                x.excel_row or 0,
                x.severity != "error",
                x.code,
            )
        )
    return buckets


def _duplication_block_for_column(
    col: str,
    dup_meta: dict[str, Any],
) -> tuple[list[str], list[str]]:
    """
    سطور تكرار لعرض التقرير حسب العمود.

    تكرار المستفيد (نفس الشخص في أكثر من صف) يُعرَض فقط عبر أخطاء ``duplicate_beneficiary_rows``
    في قائمة المشاكل — لا نكرّر هنا ``[DUPLICATES]`` / ``[DUPLICATE ROWS]``.
    يبقى هنا تكرار الخدمات تحت عمود Product إن وُجد.
    """
    ar: list[str] = []
    en: list[str] = []
    s_dup = dup_meta.get("duplicate_service_groups") or []

    if col == "Product" and s_dup:
        ar.append("  [تكرار] نفس المنتج لنفس معرّف الشخص في أكثر من صف:")
        en.append("  [DUPLICATION] Same product for same person on multiple rows:")
        for d in s_dup:
            ar.append(
                f"    [تكرار] «{d['person_id']}» + «{d['product']}» — {d['duplicate_row_count']} صف"
            )
            en.append(
                f"    [DUPLICATION] {d['person_id']!r} + {d['product']!r} — {d['duplicate_row_count']} rows"
            )

    return ar, en


# أعمدة/مجموعات تُعرض في كتلة المعرّفات مباشرة بعد الترويسة
REPORT_IDENTIFIER_PRIORITY_COLUMNS: tuple[str, ...] = (
    "Individual ID/National ID",
    "personal_identification_number / national_id",
    "__identifiers__",
    "personal_identification_number",
    "national_id",
    "Passport Number",
    "passport_number",
    "File Number",
)

OPENING_IDENTIFIER_DISPLAY_COLUMN = "Individual ID/National ID"


def _dedupe_issues(issues: list[ValidationIssue]) -> list[ValidationIssue]:
    seen: set[tuple[str, int | None, str]] = set()
    out: list[ValidationIssue] = []
    for i in issues:
        key = (i.code, i.excel_row, str(i.column or ""))
        if key in seen:
            continue
        seen.add(key)
        out.append(i)
    out.sort(
        key=lambda x: (
            x.excel_row is None,
            x.excel_row or 0,
            x.severity != "error",
            x.code,
        )
    )
    return out


def _merge_null_info_for_columns(
    null_lookup: dict[str, dict[str, Any]],
    columns: list[str],
) -> dict[str, Any] | None:
    total_blank = 0
    rows_all: list[int] = []
    used_cols: list[str] = []
    for col in columns:
        info = null_lookup.get(col)
        if not info:
            continue
        used_cols.append(col)
        total_blank += int(info.get("blank_count") or 0)
        rows_all.extend(list(info.get("excel_rows_all") or []))
    if total_blank <= 0:
        return None
    rows_all = sorted(set(int(x) for x in rows_all))
    sample = rows_all[:45]
    return {
        "column": OPENING_IDENTIFIER_DISPLAY_COLUMN,
        "blank_count": total_blank,
        "excel_rows_all": rows_all,
        "excel_rows_sample": sample,
        "truncated": len(rows_all) > len(sample),
        "source_columns": used_cols,
    }


def _collect_opening_identifier_bundle(
    by_col: dict[str, list[ValidationIssue]],
    null_lookup: dict[str, dict[str, Any]],
) -> tuple[list[ValidationIssue], dict[str, Any] | None, set[str]]:
    """يجمع كل مشاكل/فراغات المعرّفات لعرضها أولاً تحت «Individual ID/National ID»."""
    source_cols: set[str] = set()
    merged: list[ValidationIssue] = []
    for pcol in REPORT_IDENTIFIER_PRIORITY_COLUMNS:
        if pcol in by_col and by_col[pcol]:
            merged.extend(by_col[pcol])
            source_cols.add(pcol)
    merged = _dedupe_issues(merged)
    null_info = _merge_null_info_for_columns(
        null_lookup,
        [
            "Individual ID/National ID",
            "personal_identification_number",
            "national_id",
            "personal_identification_number / national_id",
        ],
    )
    return merged, null_info, source_cols


def _column_section_skipped_for_mode(col: str, mode: str) -> bool:
    if mode == "services" and _is_case_demographic_column(col):
        return True
    if mode == "cases" and _is_service_column(col):
        return True
    return False


def _emit_column_report_section(
    col: str,
    col_issues: list[ValidationIssue],
    null_info: dict[str, Any] | None,
    cases_df: pd.DataFrame,
    services_df: pd.DataFrame,
    dup_meta: dict[str, Any],
    mode: str,
) -> tuple[list[str], list[str], dict[str, Any] | None]:
    """قسم عمود واحد في التقرير؛ يُرجع (عربي، إنجليزي، structured) أو ([], [], None) إن لا محتوى."""
    if _column_section_skipped_for_mode(col, mode):
        return [], [], None

    dar, den = _duplication_block_for_column(col, dup_meta)
    if mode == "cases":
        dar, den = [], []
    elif mode == "services" and col not in (
        "Product",
        "Actual Amount",
        "Actual Date",
        "Expected Date",
        "Individual ID/National ID",
    ) and not _is_service_column(col):
        dar, den = [], []

    bn = int(null_info.get("blank_count") or 0) if null_info else 0
    n_rows_b = _baseline_rows_for_column(col, cases_df, services_df)
    only_missing_required = bool(col_issues) and all(
        x.code == "missing_required_column" for x in col_issues
    )
    show_null_block = bn > 0 and not only_missing_required
    has_dup = bool(dar)
    has_issues = bool(col_issues)
    if not (show_null_block or has_dup or has_issues):
        return [], [], None

    if col == "__general__":
        title_ar = "▌ عام — الملف ككل"
        title_en = "▌ General — whole sheet / file"
    elif col == "__identifiers__":
        title_ar = "▌ معرّفات — مجموعة أعمدة الهوية"
        title_en = "▌ Identifiers — ID columns (grouped)"
    elif col == "__services__":
        title_ar = "▌ خدمات — عام"
        title_en = "▌ Services — general"
    else:
        title_ar = f"▌ عمود «{col}»"
        title_en = f"▌ Column {col!r}"

    sec_ar = [title_ar]
    sec_en = [title_en]

    if show_null_block and null_info is not None:
        n_rows = n_rows_b
        pct = (100.0 * bn / n_rows) if n_rows else 0.0
        sec_ar.append(
            f"  [فراغات] {bn} خلية فارغة من أصل {n_rows} صفاً تقريباً ({pct:.1f}%)."
        )
        sec_en.append(
            f"  [BLANKS] {bn} empty/null cells (~{n_rows} row baseline, {pct:.1f}%)."
        )

    if has_dup:
        sec_ar.extend(dar)
        sec_en.extend(den)

    issue_rows_struct: list[dict[str, Any]] = []
    for i in col_issues:
        tag_ar, tag_en = _issue_report_tag_pair(i.code)
        if i.code == "missing_required_column":
            row_part_ar = "العمود غير موجود في الشيت (مطلوب في القالب)"
            row_part_en = "Column not found in workbook (required by template)"
        else:
            row_part_ar = f"صف Excel {i.excel_row}" if i.excel_row is not None else "بدون صف"
            row_part_en = f"Excel row {i.excel_row}" if i.excel_row is not None else "no row"
        val_ar, val_en = _issue_value_labels(i)
        val_suffix_ar = f" — {val_ar}" if val_ar else ""
        val_suffix_en = f" — {val_en}" if val_en else ""
        id_ar, id_en = _issue_row_id_suffix(i)

        line_ar = f"  [{tag_ar}] {row_part_ar}{val_suffix_ar}{id_ar}".rstrip()
        line_en = f"  [{tag_en}] {row_part_en}{val_suffix_en}{id_en}".rstrip()
        sec_ar.append(line_ar)
        sec_en.append(line_en)

        ids = dict(i.identifiers) if i.identifiers else {}
        issue_rows_struct.append(
            {
                "code": i.code,
                "severity": i.severity,
                "excel_row": i.excel_row,
                "row_index": i.row_index,
                "schema_field_id": ids.get("field_id") or None,
                "value_hint_ar": val_ar or None,
                "value_hint_en": val_en or None,
                "beneficiary_hint_ar": id_ar.strip() if id_ar else None,
                "beneficiary_hint_en": id_en.strip() if id_en else None,
                "identifiers": ids,
            }
        )

    struct_entry = {
        "column": col,
        "blanks": null_info if show_null_block else None,
        "blank_count": bn if show_null_block else 0,
        "issue_codes": [i.code for i in col_issues],
        "issue_count": len(col_issues),
        "has_duplication_block": has_dup,
        "issues": issue_rows_struct,
        "priority_block": col in REPORT_IDENTIFIER_PRIORITY_COLUMNS,
    }
    return sec_ar, sec_en, struct_entry


def format_validation_messages_by_column_ar_en(
    issues: list[ValidationIssue],
    cases_df: pd.DataFrame,
    services_df: pd.DataFrame,
    null_meta: dict[str, Any],
    dup_meta: dict[str, Any],
    *,
    validate_mode: str = "both",
    identifier_blank_stats: dict[str, Any] | None = None,
) -> tuple[str, str, dict[str, Any]]:
    """
    تقرير نصي مرتب عموداً عموداً: فراغات، تكرار، ثم أخطاء/تحذيرات الصفوف (مع قيم عندما تتوفر).
    """
    mode = _normalize_validate_mode(validate_mode)
    ordered = _ordered_data_columns(cases_df, services_df)
    if mode == "services":
        ordered = [c for c in ordered if not _is_case_demographic_column(c)]
    elif mode == "cases":
        ordered = [c for c in ordered if not _is_service_column(c)]

    by_col = _group_issues_by_column(issues, cases_df, services_df)
    extra_cols = sorted(set(by_col.keys()) - set(ordered))
    special_first = [c for c in ("__general__", "__identifiers__", "__services__") if c in extra_cols]
    rest_extra = [c for c in extra_cols if c not in special_first]
    column_order = special_first + ordered + rest_extra

    null_lookup = _merged_null_lookup(null_meta)

    mode_note_ar = {
        "both": "التحقق: الحالات والخدمات معاً.",
        "cases": "التحقق: الحالات فقط (بدون ملاحظات أعمدة الخدمات).",
        "services": "التحقق: الخدمات فقط (بدون ملاحظات أعمدة بيانات الحالة/المستفيد).",
    }[mode]
    mode_note_en = {
        "both": "Validation scope: cases and services.",
        "cases": "Validation scope: cases only (service columns ignored).",
        "services": "Validation scope: services only (case/demographic columns ignored).",
    }[mode]

    lines_ar: list[str] = [
        "── تقرير بالأعمدة: [غير موجود] / [فراغات] / [تكرار] / [قيمة خاطئة] ثم تفاصيل الصفوف ──",
    ]
    lines_en: list[str] = [
        "── Column report: [NOT_FOUND] / [BLANKS] / [DUPLICATION] / [WRONG] then row lines ──",
    ]

    structured: dict[str, Any] = {
        "validate_mode": mode,
        "identifier_dual_blank": identifier_blank_stats,
        "columns": [],
    }

    emitted_priority: set[str] = set()
    cases_rep = cases_df if mode in ("both", "cases") else pd.DataFrame()
    svc_rep = services_df if mode in ("both", "services") else pd.DataFrame()

    def _null_for_col(column: str) -> dict[str, Any] | None:
        if column in ("__general__", "__identifiers__", "__services__"):
            return None
        return null_lookup.get(column)

    # كتلة معرّفات موحّدة أولاً (Individual ID/National ID + missing_identifier + فراغات PIN)
    open_issues, open_null, open_src_cols = _collect_opening_identifier_bundle(
        by_col, null_lookup
    )
    if open_issues or open_null:
        sec_ar, sec_en, entry = _emit_column_report_section(
            OPENING_IDENTIFIER_DISPLAY_COLUMN,
            open_issues,
            open_null,
            cases_rep,
            svc_rep,
            dup_meta,
            mode,
        )
        if entry:
            entry["opening_identifier_bundle"] = True
            entry["source_columns"] = sorted(open_src_cols)
            lines_ar.append("")
            lines_ar.extend(sec_ar)
            lines_en.append("")
            lines_en.extend(sec_en)
            structured["columns"].append(entry)
            emitted_priority.add(OPENING_IDENTIFIER_DISPLAY_COLUMN)
            emitted_priority.update(open_src_cols)
            emitted_priority.update(REPORT_IDENTIFIER_PRIORITY_COLUMNS)

    for pcol in REPORT_IDENTIFIER_PRIORITY_COLUMNS:
        if pcol in emitted_priority:
            continue
        if pcol not in by_col and pcol not in null_lookup:
            continue
        sec_ar, sec_en, entry = _emit_column_report_section(
            pcol,
            by_col.get(pcol, []),
            _null_for_col(pcol),
            cases_rep,
            svc_rep,
            dup_meta,
            mode,
        )
        if not entry:
            continue
        lines_ar.append("")
        lines_ar.extend(sec_ar)
        lines_en.append("")
        lines_en.extend(sec_en)
        structured["columns"].append(entry)
        emitted_priority.add(pcol)

    lines_ar.append(mode_note_ar)
    lines_en.append(mode_note_en)

    id_ar, id_en = _format_identifier_dual_blank_preamble_ar_en(identifier_blank_stats)
    if id_ar:
        lines_ar.append("")
        lines_ar.extend(id_ar)
        lines_en.append("")
        lines_en.extend(id_en)

    for col in column_order:
        if col in emitted_priority:
            continue

        sec_ar, sec_en, entry = _emit_column_report_section(
            col,
            by_col.get(col, []),
            _null_for_col(col),
            cases_rep,
            svc_rep,
            dup_meta,
            mode,
        )
        if not entry:
            continue

        lines_ar.append("")
        lines_ar.extend(sec_ar)
        lines_en.append("")
        lines_en.extend(sec_en)
        structured["columns"].append(entry)

    blob_ar = "\n".join(lines_ar)
    blob_en = "\n".join(lines_en)
    if len(structured["columns"]) == 0:
        blob_ar += "\n\n(لا توجد ملاحظات مسجّلة حسب العمود.)"
        blob_en += "\n\n(No per-column issues to report.)"
    return blob_ar, blob_en, structured


def _validation_issues_from_missing_columns(
    missing: list[dict[str, Any]],
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for m in missing:
        labels_ar = str(m.get("labels_ar") or m.get("official_header") or "")
        labels_en = str(m.get("labels_en") or m.get("official_header") or "")
        official = str(m.get("official_header") or "")
        field_id = str(m.get("field_id") or "")
        sample = m.get("match_names_sample") or []
        sample_txt = ", ".join(str(x) for x in sample[:6])
        if sample_txt:
            hint_ar = f" يمكن استخدام أحد المرادفات المعتمدة مثل: {sample_txt}."
            hint_en = f" Accepted synonyms include: {sample_txt}."
        else:
            hint_ar = ""
            hint_en = ""
        issues.append(
            ValidationIssue(
                severity="error",
                code="missing_required_column",
                message_ar=(
                    f"العمود المطلوب غير موجود: {labels_ar} (عمود القالب: «{official}»).{hint_ar}"
                    " أضف العمود أو استخدم اسماً مطابقاً للقالب."
                ),
                message_en=(
                    f"[MISSING COLUMN] Required column not found: {labels_en} "
                    f"(template header: {official!r}).{hint_en}"
                ),
                excel_row=None,
                row_index=None,
                column=official or None,
                identifiers={
                    "field_id": field_id,
                    "official_header": official,
                    "accepted_aliases_hint": sample,
                },
            )
        )
    return issues


def _collect_case_issues(cases_df: pd.DataFrame) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []

    if cases_df is None or cases_df.empty:
        return [
            ValidationIssue(
                severity="error",
                code="empty_sheet",
                message_ar="الملف لا يحتوي على صفوف بيانات.",
                message_en="The workbook has no data rows.",
                excel_row=None,
                row_index=None,
            )
        ]

    df = cases_df
    if "_excel_row" not in df.columns:
        raise ValueError("cases_df must contain _excel_row (use _normalize_frames_for_validation).")

    pin_col = _resolve_personal_id_column(df)
    nat_col = _resolve_national_id_column(df)
    name_col = "name" if "name" in df.columns else None
    phone_col = _resolve_phone_column(df)
    phone_alt_col = _resolve_phone_alt_column(df)
    file_col = "File Number" if "File Number" in df.columns else None
    state_col = "State" if "State" in df.columns else None
    nationality_col = "Nationality" if "Nationality" in df.columns else None
    is_ref_col = _find_is_refugees_column(df)

    pids = df[pin_col].map(clean_id) if pin_col else pd.Series([None] * len(df))
    nids = df[nat_col].map(clean_id) if nat_col else pd.Series([None] * len(df))

    key_positions: dict[tuple[str, str], list[int]] = {}
    for pos in range(len(df)):
        pv = pids.iloc[pos]
        nv = nids.iloc[pos]
        key = ("p", pv) if pv else ("n", nv) if nv else None
        if key is None:
            continue
        key_positions.setdefault(key, []).append(pos)

    for key, positions in key_positions.items():
        if len(positions) < 2:
            continue
        excel_rows = sorted({int(df.at[p, "_excel_row"]) for p in positions})
        name_val = df.at[positions[0], name_col] if name_col else None
        dup_col = (pin_col if key[0] == "p" else nat_col) or (
            "personal_identification_number" if key[0] == "p" else "national_id"
        )
        issues.append(
            ValidationIssue(
                severity="error",
                code="duplicate_beneficiary_rows",
                column=dup_col,
                message_ar=(
                    f"المشكلة: تكرار معرّف المستفيد (Individual ID / National ID) — القيمة «{key[1]}» "
                    f"— متكررة {len(positions)} مرات. احذف الصف الزائد أو ادمج البيانات."
                ),
                message_en=(
                    f"[DUPLICATE PERSON ID] Same beneficiary identifier {key[1]!r} "
                    f"repeated {len(positions)} times. Remove or merge duplicate rows."
                ),
                excel_row=excel_rows[0],
                row_index=positions[0],
                identifiers={
                    "key_type": key[0],
                    "id_value": key[1],
                    "excel_rows": excel_rows,
                    "duplicate_row_count": len(positions),
                    "name": None if name_val is None or pd.isna(name_val) else str(name_val),
                },
            )
        )

    for pos in range(len(df)):
        excel_row = int(df.at[pos, "_excel_row"])
        name_val = df.at[pos, name_col] if name_col else ""
        pin_val = pids.iloc[pos]
        nat_val = nids.iloc[pos]

        id_ctx = {
            "personal_identification_number": pin_val,
            "national_id": nat_val,
            "File Number": None
            if not file_col or pd.isna(df.at[pos, file_col])
            else str(df.at[pos, file_col]).strip(),
            "name": None if _is_blank(name_val) else str(name_val).strip(),
        }
        if nationality_col is not None:
            nv0 = df.at[pos, nationality_col]
            id_ctx["Nationality"] = (
                None if _is_blank(nv0) else str(nv0).strip()
            )
        if is_ref_col is not None:
            ir0 = df.at[pos, is_ref_col]
            id_ctx["IsRefugees"] = (
                None if _is_blank(ir0) else str(ir0).strip()
            )

        if not pin_val and not nat_val:
            issues.append(
                ValidationIssue(
                    severity="error",
                    code="missing_identifier",
                    message_ar=(
                        f"صف Excel رقم {excel_row} — المشكلة: عمودا الرقم الشخصي (Individual ID / "
                        f"personal_identification_number) والرقم القومي (National ID) فارغان أو null معاً؛ "
                        "يجب إدخال قيمة في أحدهما على الأقل في هذا الصف."
                    ),
                    message_en=(
                        f"[MISSING ID] Excel sheet row #{excel_row}: problem — both Individual ID "
                        "and National ID are empty/null on this row. Fill at least one."
                    ),
                    excel_row=excel_row,
                    row_index=pos,
                    column="personal_identification_number / national_id",
                    identifiers=id_ctx,
                )
            )

        if name_col and not _is_blank(name_val):
            wc = len(str(name_val).split())
            if wc < 3:
                issues.append(
                    ValidationIssue(
                        severity="warning",
                        code="name_short",
                        message_ar=(
                            f"صف {excel_row}: الاسم أقل من 3 كلمات ({wc}). "
                            "تأكد أن الاسم رباعي كما في الوثائق."
                        ),
                        message_en=(
                            f"[SHORT NAME] Excel row {excel_row}: name has only {wc} word(s). "
                            "Expected full 4-part name as on documents."
                        ),
                        excel_row=excel_row,
                        row_index=pos,
                        column="name",
                        identifiers=id_ctx,
                    )
                )
        elif name_col:
            issues.append(
                ValidationIssue(
                    severity="error",
                    code="missing_name",
                    message_ar=f"صف {excel_row}: الاسم فارغ.",
                    message_en=f"[MISSING NAME] Excel row {excel_row}: name column is empty.",
                    excel_row=excel_row,
                    row_index=pos,
                    column="name",
                    identifiers=id_ctx,
                )
            )

        if phone_col:
            raw = df.at[pos, phone_col]
            if _is_blank(raw):
                issues.append(
                    ValidationIssue(
                        severity="error",
                        code="missing_phone",
                        message_ar=(
                            f"صف Excel رقم {excel_row} — المشكلة: عمود التليفون (phone) فارغ أو null؛ "
                            "يجب إدخال رقم في هذا الصف."
                        ),
                        message_en=(
                            f"[MISSING PHONE] Excel sheet row #{excel_row}: problem — phone column "
                            "is empty/null on this row."
                        ),
                        excel_row=excel_row,
                        row_index=pos,
                        column=phone_col,
                        identifiers=id_ctx,
                    )
                )
            else:
                ok, normalized = phone_is_valid_egyptian(raw)
                if not ok:
                    issues.append(
                        ValidationIssue(
                            severity="error",
                            code="invalid_phone",
                            message_ar=(
                                f"صف Excel رقم {excel_row} — المشكلة: قيمة التليفون غير صالحة ({normalized}). "
                                "المتوقع 11 رقم يبدأ بـ 0 أو 10 أرقام بدون الصفر."
                            ),
                            message_en=(
                                f"[INVALID PHONE] Excel sheet row #{excel_row}: problem — phone value "
                                f"{normalized!r} is invalid. Use 11 digits starting with 0, or 10 digits."
                            ),
                            excel_row=excel_row,
                            row_index=pos,
                            column=phone_col,
                            identifiers={
                                **id_ctx,
                                "phone_raw": str(raw).strip(),
                                "phone_normalized_attempt": normalized,
                            },
                        )
                    )

        if phone_alt_col:
            raw_alt = df.at[pos, phone_alt_col]
            ok_alt, norm_alt = phone_is_valid_egyptian(raw_alt)
            if not _is_blank(raw_alt) and not ok_alt:
                issues.append(
                    ValidationIssue(
                        severity="warning",
                        code="invalid_phone_alt",
                        message_ar=f"صف {excel_row}: رقم التليفون البديل غير صالح.",
                        message_en=(
                            f"[INVALID ALT PHONE] Excel row {excel_row}: alternate phone looks invalid."
                        ),
                        excel_row=excel_row,
                        row_index=pos,
                        column=phone_alt_col,
                        identifiers={
                            **id_ctx,
                            "phone_raw": str(raw_alt).strip(),
                            "phone_normalized_attempt": norm_alt,
                        },
                    )
                )

        if state_col is not None:
            st = df.at[pos, state_col]
            if _is_blank(st):
                issues.append(
                    ValidationIssue(
                        severity="error",
                        code="missing_state",
                        message_ar=(
                            f"صف {excel_row}: المحافظة (State) فارغة — يجب اختيار محافظة صالحة."
                        ),
                        message_en=(
                            f"[MISSING STATE] Excel row {excel_row}: governorate (State) is empty."
                        ),
                        excel_row=excel_row,
                        row_index=pos,
                        column="State",
                        identifiers=id_ctx,
                    )
                )

        if nationality_col is not None:
            nt = df.at[pos, nationality_col]
            if _is_blank(nt):
                issues.append(
                    ValidationIssue(
                        severity="error",
                        code="missing_nationality",
                        message_ar=(
                            f"صف {excel_row}: الجنسية (Nationality) فارغة — أدخل جنسية صالحة."
                        ),
                        message_en=(
                            f"[MISSING NATIONALITY] Excel row {excel_row}: Nationality is empty."
                        ),
                        excel_row=excel_row,
                        row_index=pos,
                        column="Nationality",
                        identifiers=id_ctx,
                    )
                )

        if is_ref_col is not None:
            ir = df.at[pos, is_ref_col]
            kind = _classify_is_refugees(ir)
            if kind == "empty":
                issues.append(
                    ValidationIssue(
                        severity="error",
                        code="missing_is_refugees",
                        message_ar=(
                            f"صف {excel_row}: حقل لاجئ؟ (IsRefugees) فارغ — استخدم نعم أو لا (أو yes/no)."
                        ),
                        message_en=(
                            f"[MISSING IsRefugees] Excel row {excel_row}: IsRefugees is empty. "
                            "Use yes/no (or نعم/لا)."
                        ),
                        excel_row=excel_row,
                        row_index=pos,
                        column=is_ref_col,
                        identifiers=id_ctx,
                    )
                )
            elif kind == "invalid":
                issues.append(
                    ValidationIssue(
                        severity="error",
                        code="invalid_is_refugees",
                        message_ar=(
                            f"صف {excel_row}: قيمة IsRefugees غير مفهومة ({str(ir).strip()}). "
                            "المسموح: نعم / لا أو yes / no."
                        ),
                        message_en=(
                            f"[INVALID IsRefugees] Excel row {excel_row}: value {ir!r} is not recognized. "
                            "Use yes/no or نعم/لا."
                        ),
                        excel_row=excel_row,
                        row_index=pos,
                        column=is_ref_col,
                        identifiers={**id_ctx, "raw_value": str(ir).strip()},
                    )
                )

    return issues


def _collect_service_issues(services_df: pd.DataFrame) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []

    if services_df is None or services_df.empty:
        return issues

    if "_excel_row" not in services_df.columns:
        raise ValueError("services_df must contain _excel_row.")

    id_col = "Individual ID/National ID"
    prod_col = "Product"

    for pos in range(len(services_df)):
        excel_row = int(services_df.at[pos, "_excel_row"])
        row = services_df.iloc[pos]
        oid = clean_id(row.get(id_col)) if id_col in services_df.columns else None
        prod = row.get(prod_col) if prod_col in services_df.columns else None

        ids_ctx = {
            "Individual ID/National ID": oid,
            "Product": None if pd.isna(prod) else str(prod).strip(),
        }

        if not oid:
            issues.append(
                ValidationIssue(
                    severity="error",
                    code="service_missing_person_id",
                    message_ar=(
                        f"صف Excel رقم {excel_row} — المشكلة: صف خدمة لكن معرّف الشخص (Individual ID / "
                        f"National ID المجمّع للخدمات) فارغ أو null في نفس الصف؛ أضف الرقم الشخصي أو القومي."
                    ),
                    message_en=(
                        f"[SERVICE MISSING ID] Excel sheet row #{excel_row}: problem — this service row has "
                        "empty/null Individual/National ID (person key used for services). Fill ID on this row."
                    ),
                    excel_row=excel_row,
                    row_index=pos,
                    column=id_col,
                    identifiers=ids_ctx,
                )
            )

        if _is_blank(prod):
            issues.append(
                ValidationIssue(
                    severity="error",
                    code="service_missing_product",
                    message_ar=f"صف {excel_row}: نوع الخدمة (Service / Product) فارغ.",
                    message_en=(
                        f"[SERVICE MISSING TYPE] Excel row {excel_row}: service/product column "
                        "(e.g. Service 1) is empty."
                    ),
                    excel_row=excel_row,
                    row_index=pos,
                    column=prod_col,
                    identifiers=ids_ctx,
                )
            )

        amt_col = "Actual Amount" if "Actual Amount" in services_df.columns else None
        act_date_col = "Actual Date" if "Actual Date" in services_df.columns else None
        exp_date_col = "Expected Date" if "Expected Date" in services_df.columns else None

        if amt_col:
            raw_amt = row.get(amt_col)
            amt_val, amt_st = _parse_positive_amount(raw_amt)
            if amt_st == "empty":
                issues.append(
                    ValidationIssue(
                        severity="error",
                        code="missing_actual_amount",
                        message_ar=(
                            f"صف {excel_row}: تكلفة التنفيذ (Actual Amount) فارغة — يجب إدخال مبلغ أكبر من صفر."
                        ),
                        message_en=(
                            f"[MISSING AMOUNT] Excel row {excel_row}: Actual Amount is empty; "
                            "enter a value greater than 0."
                        ),
                        excel_row=excel_row,
                        row_index=pos,
                        column=amt_col,
                        identifiers=ids_ctx,
                    )
                )
            elif amt_st == "invalid":
                issues.append(
                    ValidationIssue(
                        severity="error",
                        code="invalid_actual_amount",
                        message_ar=(
                            f"صف {excel_row}: قيمة التكلفة (Actual Amount) غير رقمية: {raw_amt!s}."
                        ),
                        message_en=(
                            f"[INVALID AMOUNT] Excel row {excel_row}: Actual Amount is not a valid number: {raw_amt!r}."
                        ),
                        excel_row=excel_row,
                        row_index=pos,
                        column=amt_col,
                        identifiers={**ids_ctx, "raw_value": str(raw_amt).strip()},
                    )
                )
            elif amt_st == "not_positive":
                issues.append(
                    ValidationIssue(
                        severity="error",
                        code="actual_amount_not_positive",
                        message_ar=(
                            f"صف {excel_row}: التكلفة الفعلية يجب أن تكون أكبر من صفر (القيمة الحالية: {amt_val})."
                        ),
                        message_en=(
                            f"[AMOUNT NOT > 0] Excel row {excel_row}: Actual Amount must be > 0 "
                            f"(got {amt_val})."
                        ),
                        excel_row=excel_row,
                        row_index=pos,
                        column=amt_col,
                        identifiers={**ids_ctx, "amount": amt_val},
                    )
                )

        if act_date_col:
            raw_ad = row.get(act_date_col)
            if _is_blank(raw_ad):
                issues.append(
                    ValidationIssue(
                        severity="error",
                        code="missing_actual_date",
                        message_ar=(
                            f"صف {excel_row}: تاريخ التنفيذ الفعلي (Actual Date) فارغ."
                        ),
                        message_en=(
                            f"[MISSING ACTUAL DATE] Excel row {excel_row}: Actual Date is empty."
                        ),
                        excel_row=excel_row,
                        row_index=pos,
                        column=act_date_col,
                        identifiers=ids_ctx,
                    )
                )
            elif _parse_date_cell(raw_ad) is None:
                issues.append(
                    ValidationIssue(
                        severity="error",
                        code="invalid_actual_date",
                        message_ar=(
                            f"صف {excel_row}: تاريخ التنفيذ الفعلي غير صالح أو غير مفهوم: {raw_ad!s}."
                        ),
                        message_en=(
                            f"[INVALID ACTUAL DATE] Excel row {excel_row}: cannot parse Actual Date: {raw_ad!r}."
                        ),
                        excel_row=excel_row,
                        row_index=pos,
                        column=act_date_col,
                        identifiers={**ids_ctx, "raw_value": str(raw_ad).strip()},
                    )
                )

        if exp_date_col:
            raw_ed = row.get(exp_date_col)
            if _is_blank(raw_ed):
                issues.append(
                    ValidationIssue(
                        severity="error",
                        code="missing_expected_date",
                        message_ar=(
                            f"صف {excel_row}: التاريخ المتوقع (Expected Date) فارغ."
                        ),
                        message_en=(
                            f"[MISSING EXPECTED DATE] Excel row {excel_row}: Expected Date is empty."
                        ),
                        excel_row=excel_row,
                        row_index=pos,
                        column=exp_date_col,
                        identifiers=ids_ctx,
                    )
                )
            elif _parse_date_cell(raw_ed) is None:
                issues.append(
                    ValidationIssue(
                        severity="error",
                        code="invalid_expected_date",
                        message_ar=(
                            f"صف {excel_row}: التاريخ المتوقع غير صالح أو غير مفهوم: {raw_ed!s}."
                        ),
                        message_en=(
                            f"[INVALID EXPECTED DATE] Excel row {excel_row}: "
                            f"cannot parse Expected Date: {raw_ed!r}."
                        ),
                        excel_row=excel_row,
                        row_index=pos,
                        column=exp_date_col,
                        identifiers={**ids_ctx, "raw_value": str(raw_ed).strip()},
                    )
                )

    tmp = services_df.copy()
    tmp["_oid"] = tmp[id_col].map(clean_id) if id_col in tmp.columns else ""
    tmp["_pc"] = (
        tmp[prod_col].astype(str).str.strip().str.lower()
        if prod_col in tmp.columns
        else ""
    )
    tmp = tmp[tmp["_oid"].astype(str).str.len() > 0]
    tmp = tmp[tmp["_pc"].ne("") & tmp["_pc"].ne("nan")]

    for (_oid, _pc), grp in tmp.groupby(["_oid", "_pc"], sort=False):
        if len(grp) < 2:
            continue
        excel_rows = sorted({int(x) for x in grp["_excel_row"].tolist()})
        issues.append(
            ValidationIssue(
                severity="warning",
                code="duplicate_service_same_person",
                message_ar=(
                    f"المشكلة: تكرار خدمة لنفس المعرّف — الخدمة «{_pc}» للمعرّف «{_oid}». "
                    f"أرقام صفوف Excel المتأثرة: {excel_rows}."
                ),
                message_en=(
                    f"[DUPLICATE SERVICE] Problem: same service {_pc!r} repeated for person ID {_oid!r}. "
                    f"Affected Excel sheet row numbers: {excel_rows}."
                ),
                excel_row=excel_rows[0],
                row_index=None,
                identifiers={
                    "person_key": _oid,
                    "product": _pc,
                    "excel_rows": excel_rows,
                    "duplicate_row_count": len(grp),
                },
            )
        )

    return issues


def validate_volunteer_upload(
    path: str,
    *,
    sheet_name: str | None = None,
    header_rows: int = 1,
    schema_path: str | Path | None = None,
    validate_mode: str = "both",
) -> dict[str, Any]:
    """
    يقرأ ملف الإكسيل المجمّع ويشغّل التحقق.

    قبل قواعد الصفوف: يطبّق ``volunteer_validation_schema.json`` (أو مسار ``schema_path``)
    لتسمية الأعمدة والتحقق من وجود الأعمدة الإلزامية (مع مرادفات من القالب وملف
    ``column_aliases.json`` كما في ``volunteer_upload_schema``).

    يُرجع قاموس فيه:
    - ``ok``: لا أخطاء error (تحذيرات مسموحة)
    - ``errors_count`` / ``warnings_count``
    - ``issues``: قائمة dict جاهزة لـ JSON
    - ``messages_ar`` / ``messages_en``: نص **مرتب بالعمود** (فراغات → تكرار → أخطاء الصفوف + قيم عند الحاجة)
    - ``column_validation``: معلومات إعادة التسمية والمخطط عند تفعيله
    - ``null_summary_ar`` / ``null_summary_en``: سلسلتان فارغتان (محجوزتان للتوافق؛ الفراغات في ``messages_*``)
    - ``duplication_summary_ar`` / ``duplication_summary_en``: فارغان (تفاصيل التكرار في ``messages_*`` و``data_quality``)
    - ``data_quality``: ``{"nulls": {...}, "duplicates": {...}}`` للاستهلاك برمجياً
    - ``column_report``: ملخّص برمجي لكل عمود ظهر فيه فراغ/تكرار/خطأ؛ وكل عنصر يتضمن ``issues``
      (قائمة بـ ``code`` و``excel_row`` و``identifiers`` ونصوص مساعدة عند الحاجة).
    """
    # تأخير الاستيراد لتجنّب أي تأثير جانبي من سلسلة استيراد ثقيلة
    from volunteer_upload_schema import apply_volunteer_column_schema

    resolved_sheet: str | None = None
    if sheet_name:
        raw_probe = pd.read_excel(path, sheet_name=sheet_name, dtype=str)
        resolved_sheet = sheet_name
    else:
        # بدون sheet صريح: نبحث عن أوّل شيت بتنسيق NRC العريض (مثل load_cases) ثم نطبّق القالب عليه
        xl = pd.ExcelFile(path)
        chosen: str | None = None
        for cand in xl.sheet_names:
            probe = pd.read_excel(path, sheet_name=cand, dtype=str, nrows=12)
            if looks_like_nrc_wide_case_plus_service(probe):
                chosen = cand
                break
        if chosen is not None:
            raw_probe = pd.read_excel(path, sheet_name=chosen, dtype=str)
            resolved_sheet = chosen
        else:
            raw_probe = pd.read_excel(path, dtype=str)
            resolved_sheet = xl.sheet_names[0] if xl.sheet_names else None
    raw_mapped, missing_required, col_meta = apply_volunteer_column_schema(
        raw_probe, schema_path
    )

    schema_issues = _validation_issues_from_missing_columns(missing_required)

    if looks_like_nrc_wide_case_plus_service(raw_mapped):
        cases_df, services_df = split_nrc_cash_assistance_wide(raw_mapped)
    else:
        effective_sheet = sheet_name or resolved_sheet
        if effective_sheet:
            cases_df, services_df = load_cases_and_services_frames(
                path, mixed_sheet=effective_sheet, mixed_sheet_df=raw_mapped
            )
        else:
            cases_df, services_df = load_cases_and_services_frames(path)

    cases_df, services_df = _normalize_frames_for_validation(
        cases_df, services_df, header_rows=header_rows
    )

    mode = _normalize_validate_mode(validate_mode)

    case_issues = _collect_case_issues(cases_df) if mode in ("both", "cases") else []
    service_issues = _collect_service_issues(services_df) if mode in ("both", "services") else []

    issues = schema_issues + case_issues + service_issues
    issues = _drop_duplicate_service_if_same_rows_as_duplicate_person(issues)
    errors = [i for i in issues if i.severity == "error"]
    warnings = [i for i in issues if i.severity == "warning"]

    svc_for_stats = (
        services_df
        if services_df is not None and not services_df.empty
        else pd.DataFrame()
    )
    cases_for_null = cases_df if mode in ("both", "cases") else pd.DataFrame()
    svc_for_null = svc_for_stats if mode in ("both", "services") else pd.DataFrame()

    stats_df = cases_df if mode != "services" else svc_for_stats
    identifier_blank_stats = _dual_pin_passport_blank_stats(stats_df)

    null_ar, null_en, null_meta = _format_null_summary_ar_en(
        _dataframe_for_null_report(cases_for_null, mode),
        _dataframe_for_null_report(svc_for_null, mode),
    )
    dup_ar, dup_en, dup_meta = _format_duplication_summary_ar_en(
        cases_df if mode in ("both", "cases") else pd.DataFrame(),
        svc_for_stats if mode in ("both", "services") else pd.DataFrame(),
    )

    messages_ar, messages_en, column_report = format_validation_messages_by_column_ar_en(
        issues,
        cases_df if mode in ("both", "cases") else pd.DataFrame(),
        svc_for_stats if mode in ("both", "services") else pd.DataFrame(),
        null_meta,
        dup_meta,
        validate_mode=mode,
        identifier_blank_stats=identifier_blank_stats,
    )

    out: dict[str, Any] = {
        "engine_version": VALIDATION_ENGINE_VERSION,
        "validate_mode": mode,
        "ok": len(errors) == 0,
        "errors_count": len(errors),
        "warnings_count": len(warnings),
        "issues": [i.to_dict() for i in issues],
        "messages_ar": messages_ar,
        "messages_en": messages_en,
        "column_report": column_report,
        "summary_ar": _summary_ar(len(errors), len(warnings)),
        "summary_en": _summary_en(len(errors), len(warnings)),
        "null_summary_ar": null_ar,
        "null_summary_en": null_en,
        "duplication_summary_ar": dup_ar,
        "duplication_summary_en": dup_en,
        "data_quality": {"nulls": null_meta, "duplicates": dup_meta},
    }
    if not col_meta.get("skipped"):
        out["column_validation"] = col_meta
    if missing_required:
        out["missing_required_columns"] = missing_required
    return out


def _drop_duplicate_service_if_same_rows_as_duplicate_person(
    issues: list[ValidationIssue],
) -> list[ValidationIssue]:
    """
    لو نفس الشخص متكرر في صفوف كـ duplicate beneficiary، تنبيه «خدمة مكررة»
    لنفس الصفوف يكون غالباً مكرراً ومربكاً في الواجهة — نشيله.
    """
    dup_person_map: dict[str, frozenset] = {}
    for i in issues:
        if i.code != "duplicate_beneficiary_rows":
            continue
        oid = i.identifiers.get("id_value")
        rows = i.identifiers.get("excel_rows") or []
        if oid is not None and rows:
            dup_person_map[str(oid)] = frozenset(int(x) for x in rows)

    out: list[ValidationIssue] = []
    for i in issues:
        if i.code != "duplicate_service_same_person":
            out.append(i)
            continue
        oid = str(i.identifiers.get("person_key", ""))
        rows = frozenset(int(x) for x in (i.identifiers.get("excel_rows") or []))
        if oid in dup_person_map and rows == dup_person_map[oid]:
            continue
        out.append(i)
    return out


def format_validation_messages_ar(issues: list[ValidationIssue]) -> str:
    lines = []
    for i in issues:
        prefix = "خطأ: " if i.severity == "error" else "تنبيه: "
        lines.append(prefix + i.message_ar)
    return "\n".join(lines) if lines else "لا توجد ملاحظات."


def format_validation_messages_en(issues: list[ValidationIssue]) -> str:
    """مناسب لـ CMD/PowerShell — بدون اعتماد على خط عربي."""
    lines = []
    for n, i in enumerate(issues, start=1):
        lvl = "ERROR" if i.severity == "error" else "WARN"
        # رقم/أرقام الصف موجودة داخل message_en لتفادي التكرار ولتوضيح كل الصفوف في التكرار
        lines.append(f"{n}. [{lvl}] {i.code}: {i.message_en}")
    return "\n".join(lines) if lines else "No issues."


def write_validation_reports(
    result: dict[str, Any],
    output_dir: str | Path | None = None,
    *,
    include_aggregate_summaries: bool = False,
) -> dict[str, str]:
    """
    يكتب تقارير UTF-8 (مع BOM للعربي لتعرضها في Notepad بشكل سليم).
    يُرجع مسارات الملفات المكتوبة.

    افتراضياً لا يُكرّر ملخص الفراغ/التجميعي الطويل لأن ``messages_*`` أصبحت مرتبة بالعمود
    ومدمجة؛ عيّن ``include_aggregate_summaries=True`` لإلحاق النسخة الطويلة القديمة.
    """
    base = Path(output_dir or Path(__file__).resolve().parent)
    base.mkdir(parents=True, exist_ok=True)

    ar_path = base / "validation_report_ar.txt"
    en_path = base / "validation_report_en.txt"

    ar_blob = (
        result.get("summary_ar", "") + "\n\n---\n\n" + result.get("messages_ar", "")
    )
    en_blob = (
        result.get("summary_en", "") + "\n\n---\n\n" + result.get("messages_en", "")
    )
    if include_aggregate_summaries:
        if result.get("null_summary_ar"):
            ar_blob += "\n\n---\n\n" + result["null_summary_ar"]
        if result.get("null_summary_en"):
            en_blob += "\n\n---\n\n" + result["null_summary_en"]
        if result.get("duplication_summary_ar"):
            ar_blob += "\n\n---\n\n" + result["duplication_summary_ar"]
        if result.get("duplication_summary_en"):
            en_blob += "\n\n---\n\n" + result["duplication_summary_en"]

    ar_path.write_text(ar_blob, encoding="utf-8-sig")
    en_path.write_text(en_blob, encoding="utf-8")
    return {"arabic_report": str(ar_path.resolve()), "english_report": str(en_path.resolve())}


def _summary_ar(errors: int, warnings: int) -> str:
    if errors == 0 and warnings == 0:
        return "الملف يمر على التحقق الأولي. يمكن المتابعة لخطوة Odoo عند جاهزيتك."
    parts = []
    if errors:
        parts.append(f"{errors} خطأ يجب إصلاحه")
    if warnings:
        parts.append(f"{warnings} تنبيه")
    return "، ".join(parts) + "."


def _summary_en(errors: int, warnings: int) -> str:
    if errors == 0 and warnings == 0:
        return "Validation passed (no errors or warnings). You can proceed to the Odoo step when ready."
    parts = []
    if errors:
        parts.append(f"{errors} error(s) to fix")
    if warnings:
        parts.append(f"{warnings} warning(s)")
    return ", ".join(parts) + "."


if __name__ == "__main__":
    import argparse

    _configure_stdio_utf8_windows()

    default_xlsx = Path(__file__).resolve().parent / (
        "cash assis to be uploaded on odoo - NRC - 2.xlsx"
    )

    ap = argparse.ArgumentParser(description="Validate combined Excel upload.")
    ap.add_argument("excel_path", nargs="?", default=str(default_xlsx), help="Path to .xlsx")
    ap.add_argument(
        "--sheet",
        default=None,
        help="اسم التبويب (اختياري). بدون القيمة يُستخدم أوّل شيت بنفس تنسيق NRC العريض إن وُجد، وإلا أوّل شيت في الملف.",
    )
    ap.add_argument(
        "--schema",
        default=None,
        help="مسار volunteer_validation_schema.json (افتراضي بجانب السكربت)",
    )
    ap.add_argument("--lang", choices=("en", "ar", "both"), default="en", help="Console output language")
    args = ap.parse_args()

    result = validate_volunteer_upload(
        args.excel_path,
        sheet_name=args.sheet,
        schema_path=args.schema,
    )
    paths = write_validation_reports(result)

    if args.lang in ("en", "both"):
        print(result["messages_en"])
        if result.get("null_summary_en"):
            print("-" * 60)
            print(result["null_summary_en"])
        if result.get("duplication_summary_en"):
            print("-" * 60)
            print(result["duplication_summary_en"])
    if args.lang == "both":
        print("-" * 60)
    if args.lang in ("ar", "both"):
        print(result["messages_ar"])
        if result.get("null_summary_ar"):
            print("-" * 60)
            print(result["null_summary_ar"])
        if result.get("duplication_summary_ar"):
            print("-" * 60)
            print(result["duplication_summary_ar"])
    print("-" * 60)
    print("Arabic report (open in Notepad — readable RTL):", paths["arabic_report"])
    print("English report:", paths["english_report"])