"""
Helpers لقراءة ملف Excel واحد فيه Cases و/أو Services.

الاستخدام المعتاد:
- الأفضل: ملف واحد فيه تبويبين (مثلاً Cases و Services) — كل سكربت يقرأ التبويب المناسب.
- أو: شيت واحد مختلط + عمود يحدد نوع الصف (case / service).
- أو: شيت واحد — الصفوف التي فيها حقل المنتج/نوع الخدمة غير فارغ تُعتبر خدمات والباقي حالات.

الدوال هنا لا تنفّذ أي طلبات شبكة ولا تقرأ ملفات تلقائياً عند الاستيراد.
"""

from __future__ import annotations

import re

import pandas as pd


def _blank_series(s: pd.Series) -> pd.Series:
    t = s.astype(str).str.strip().str.lower()
    return s.isna() | t.eq("") | t.isin(("nan", "none"))


def split_by_explicit_row_type(
    df: pd.DataFrame,
    row_type_col: str,
    *,
    service_values: frozenset[str] | None = None,
    case_values: frozenset[str] | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    يقسم الشيت حسب عمود صريح (عربي/إنجليزي غير حساس لحالة الأحرف).

    مثال أسماء أعمدة: نوع_السجل، Row Type، النوع
    قيم services افتراضية: service, خدمة, خدمه, s
    قيم cases افتراضية: case, حالة, c
    """
    if row_type_col not in df.columns:
        raise KeyError(f"Column not found: {row_type_col!r}. Columns: {list(df.columns)}")

    svc = service_values or frozenset(
        {"service", "services", "خدمة", "خدمه", "خدمات", "s"}
    )
    cas = case_values or frozenset({"case", "cases", "حالة", "حالات", "c"})

    raw = df[row_type_col].map(
        lambda x: str(x).strip().lower() if pd.notna(x) else ""
    )
    is_service = raw.isin(svc)
    is_case = raw.isin(cas)
    empty = raw.eq("")
    unknown = (~empty) & (~is_service) & (~is_case)
    if unknown.any():
        bad = df.loc[unknown, row_type_col].unique().tolist()
        raise ValueError(
            "Found unrecognized row type values (normalize Arabic/English): "
            f"{bad[:20]}{'...' if len(bad) > 20 else ''}"
        )

    # فارغ نوع الصف: غالباً صف بيانات شخص فقط — نُحسبه مع الحالات
    cases_df = df[is_case | empty].copy()
    services_df = df[is_service].copy()
    return cases_df, services_df


def split_by_service_columns(
    df: pd.DataFrame,
    candidate_cols: list[str] | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    صف خدمة إذا كان أي عمود من المرشحين غير فارغ (بعد إعادة تسمية يدوية أو أسماء عربية).

    مرشحون افتراضيون: أسماء قريبة من عمود المنتج في services_code.
    """
    cols = candidate_cols or [
        "Product",
        "product",
        "نوع الخدمة",
        "الخدمة",
        "الخدمه",
        "Service",
        "service type",
        "نوع الخدمه",
    ]
    present = [c for c in cols if c in df.columns]
    if not present:
        # لا يوجد عمود خدمة واضح — كله يُعامل كحالات
        return df.copy(), df.iloc[0:0].copy()

    mask = False
    for c in present:
        mask = mask | (~_blank_series(df[c]))

    return df[~mask].copy(), df[mask].copy()


def _lower_join(col) -> str:
    return str(col).strip().lower()


def _find_col(df: pd.DataFrame, predicate) -> str | None:
    for c in df.columns:
        if predicate(str(c)):
            return c
    return None


def _find_col_all_tokens(df: pd.DataFrame, tokens: tuple[str, ...]) -> str | None:
    """First column whose lowercase header contains every token."""

    def pred(name: str) -> bool:
        n = _lower_join(name)
        return all(t in n for t in tokens)

    return _find_col(df, pred)


def looks_like_nrc_wide_case_plus_service(df: pd.DataFrame) -> bool:
    """
    يكتشف تنسيق مثل: cash assis to be uploaded on odoo - NRC - 2.xlsx
    (صف واحد فيه أعمدة الشخص + Service 1 + تواريخ + Amount).

    بعد ``volunteer_validation_schema`` قد يُسمّى عمود الخدمة ``Product`` فقط (بدون
    كلمة service) — نعتبره نفس التنسيق العريض إذا وُجدت أعمدة شخص + مبلغ/تاريخ فعلي.
    """
    if df is None or df.empty:
        return False
    for c in df.columns:
        n = _lower_join(c)
        if "service" in n and ("1" in n or "اول" in n or "أول" in str(c) or "اولي" in n):
            return True

    has_product_col = any(_lower_join(c) == "product" for c in df.columns)
    has_person_col = "personal_identification_number" in df.columns or (
        _find_col_all_tokens(df, ("individual", "id")) is not None
    )
    has_amount_col = (
        "Actual Amount" in df.columns
        or any(_lower_join(c) == "actual_amount" for c in df.columns)
        or _find_col(df, lambda x: "amount" in _lower_join(x)) is not None
    )
    has_actual_date = _find_col_all_tokens(df, ("actual", "date")) is not None

    if has_product_col and has_person_col and (has_amount_col or has_actual_date):
        return True
    return False


def split_nrc_cash_assistance_wide(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    يفصل شيت NRC العريض إلى:

    - cases_df: كل الصفوف، مع أعمدة مطابقة لتوقعات cases_code (أسماء كانونيكية إنجليزية).
    - services_df: صفوف فيها «Service 1» (أو ما يقابله) غير فارغ، بأعمدة جاهزة لـ
      ``standardize_services_sheet_columns`` في services_code (Product، Individual ID/National ID، …).

    الأعمدة المرجعية من الملف الفعلي (Sheet3): Interview-date، Individual ID، File Number،
    Passport Number (منفصل تماماً عن الرقم القومي)، عمود الرقم القومي إن وُجد، Name، …،
    Service 1، Referral، Interval، Actual Date، Expected Date، Amount.

    عمود رفع الخدمات ``Individual ID/National ID`` يُملّأ من القومي أو الرقم الشخصي فقط
    (نفس منطق Odoo في Case_id)، وليس من جواز السفر.
    """
    if df is None or df.empty:
        return df.copy(), df.iloc[0:0].copy()

    # بعد توحيد الأسماء عبر volunteer_validation_schema قد يصبح العمود
    # ``personal_identification_number`` — لا يُطابق ``("individual", "id")``
    # لأن normalize لا يضم كلمة individual كرمز مستقل.
    if "personal_identification_number" in df.columns:
        individual_col = "personal_identification_number"
    else:
        individual_col = _find_col_all_tokens(df, ("individual", "id"))
    passport_col = _find_col_all_tokens(df, ("passport", "number"))
    if passport_col is None:
        passport_col = _find_col_all_tokens(df, ("passport",))

    national_id_col = None
    if "national_id" in df.columns:
        national_id_col = "national_id"
    else:
        for c in df.columns:
            n = _lower_join(c)
            if "passport" in n:
                continue
            if "قومي" in str(c):
                national_id_col = c
                break
            if "national" in n and "id" in n and "individual" not in n:
                national_id_col = c
                break

    file_col = _find_col_all_tokens(df, ("file", "number"))

    name_col = _find_col(df, lambda x: _lower_join(x) == "name")

    nationality_col = _find_col_all_tokens(df, ("nationality",))
    phone_cols = [c for c in df.columns if "phone" in _lower_join(c)]
    phone_col = phone_cols[0] if phone_cols else None

    bod_col = _find_col(
        df,
        lambda x: "bod" in _lower_join(x) or "تاريخ الميلاد" in str(x),
    )
    age_col = _find_col_all_tokens(df, ("age",))
    if age_col is None:
        age_col = _find_col(df, lambda x: "السن" in str(x))

    gender_col = _find_col_all_tokens(df, ("gender",))
    if gender_col is None:
        gender_col = _find_col(df, lambda x: "النوع" in str(x) or "اجتماعي" in str(x))

    edu_col = _find_col_all_tokens(df, ("education",))
    if edu_col is None:
        edu_col = _find_col(df, lambda x: "شهادة" in str(x) or "تعليم" in str(x))

    social_col = _find_col_all_tokens(df, ("social", "status"))
    family_col = _find_col_all_tokens(df, ("family", "member"))

    state_col = _find_col_all_tokens(df, ("state",))
    if state_col is None:
        state_col = _find_col(df, lambda x: "محافظ" in str(x))

    zone_col = _find_col_all_tokens(df, ("zone",))
    if zone_col is None:
        zone_col = _find_col(df, lambda x: "مدين" in str(x))

    street_col = _find_col_all_tokens(df, ("street",))
    interview_col = _find_col(df, lambda x: "interview" in _lower_join(x))

    is_ref_col = _find_col(df, lambda x: "refugee" in _lower_join(x))

    service_col = None
    for c in df.columns:
        n = _lower_join(c)
        if "service" not in n:
            continue
        if re.search(r"\b1\b", n) or "اول" in str(c) or "أول" in str(c) or "اولي" in n:
            service_col = c
            break
    if service_col is None:
        service_col = _find_col(df, lambda x: "service" in _lower_join(x))
    if service_col is None:
        if "Product" in df.columns:
            service_col = "Product"
        elif "product" in df.columns:
            service_col = "product"

    referral_col = _find_col_all_tokens(df, ("referral",))
    interval_col = _find_col_all_tokens(df, ("interval",))
    actual_date_col = _find_col_all_tokens(df, ("actual", "date"))
    expected_date_col = _find_col_all_tokens(df, ("expected", "date"))
    amount_col = None
    for c in df.columns:
        n = _lower_join(c)
        if n.startswith("amount") or (n == "amount"):
            amount_col = c
            break
    if amount_col is None:
        amount_col = _find_col(df, lambda x: "amount" in _lower_join(x))

    cases_df = df.copy()

    def ren(src: str | None, dst: str):
        nonlocal cases_df
        if src and src in cases_df.columns and src != dst:
            cases_df = cases_df.rename(columns={src: dst})

    ren(individual_col, "personal_identification_number")
    ren(passport_col, "Passport Number")
    ren(national_id_col, "national_id")
    ren(file_col, "File Number")
    ren(name_col, "name")
    ren(nationality_col, "Nationality")
    ren(phone_col, "phone")
    ren(bod_col, "BOD")
    ren(age_col, "age")
    ren(gender_col, "gender")
    ren(edu_col, "Education Type")
    ren(social_col, "Social Status")
    ren(family_col, "Family members")
    ren(state_col, "State")
    ren(zone_col, "Zone")
    ren(street_col, "Street")
    ren(interview_col, "Interview_date")
    ren(is_ref_col, "IsRefugees")

    # توحيد هاتف بديل إن وُجد
    if len(phone_cols) > 1:
        alt = phone_cols[1]
        if alt in cases_df.columns:
            cases_df = cases_df.rename(columns={alt: "phone_alt"})

    if service_col is None:
        return cases_df, df.iloc[0:0].copy()

    svc_mask = ~_blank_series(df[service_col])
    svc_src = df.loc[svc_mask].copy()

    def _cell_str(series: pd.Series | None) -> pd.Series:
        if series is None:
            return pd.Series([""] * len(svc_src), index=svc_src.index)

        return series.map(
            lambda x: ""
            if pd.isna(x) or str(x).strip().lower() in ("nan", "none")
            else str(x).strip()
        )

    blank_ids = pd.Series([""] * len(svc_src), index=svc_src.index)
    nat_series = (
        _cell_str(svc_src[national_id_col])
        if national_id_col and national_id_col in svc_src.columns
        else blank_ids.copy()
    )
    pid_series = (
        _cell_str(svc_src[individual_col])
        if individual_col and individual_col in svc_src.columns
        else blank_ids.copy()
    )
    # Odoo Case_id: قومي ثم الرقم الشخصي — بدون جواز السفر
    odoo_person_key = nat_series.where(nat_series.ne(""), pid_series)

    passport_series = (
        _cell_str(svc_src[passport_col])
        if passport_col and passport_col in svc_src.columns
        else blank_ids.copy()
    )

    services_df = pd.DataFrame(
        {
            "Individual ID/National ID": odoo_person_key,
            "NAME": svc_src[name_col] if name_col else "",
            "Product": svc_src[service_col],
        }
    )

    if passport_series.ne("").any():
        services_df["Passport Number"] = passport_series

    if actual_date_col and actual_date_col in svc_src.columns:
        services_df["Actual Date"] = svc_src[actual_date_col]
    if expected_date_col and expected_date_col in svc_src.columns:
        services_df["Expected Date"] = svc_src[expected_date_col]
    if amount_col and amount_col in svc_src.columns:
        services_df["Actual Amount"] = svc_src[amount_col]

    if referral_col and referral_col in svc_src.columns:
        services_df["Referral"] = svc_src[referral_col]
    if interval_col and interval_col in svc_src.columns:
        services_df["Interval"] = svc_src[interval_col]

    return cases_df, services_df


def load_cases_and_services_frames(
    path: str,
    *,
    cases_sheet: str | None = None,
    services_sheet: str | None = None,
    mixed_sheet: str | None = None,
    mixed_sheet_df: pd.DataFrame | None = None,
    row_type_col: str | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    يقرأ ملف Excel ويعيد (cases_df, services_df).

    - إذا مررت cases_sheet و services_sheet: يقرأ التبويبين مباشرة.
    - وإلا إذا مررت mixed_sheet (+ اختياري row_type_col): يقسم شيتاً واحداً.
    - إذا مررت mixed_sheet_df مع mixed_sheet: يُستخدم هذا الإطار بدلاً من إعادة قراءة الملف
      (مثلاً بعد توحيد أسماء الأعمدة حسب قالب التحقق).
    - وإلا: يحاول تخمين تبويبين شائعين الاسم (Cases / Services).
    """
    if cases_sheet and services_sheet:
        return (
            pd.read_excel(path, sheet_name=cases_sheet, dtype=str),
            pd.read_excel(path, sheet_name=services_sheet, dtype=str),
        )

    if mixed_sheet:
        raw = (
            mixed_sheet_df.copy()
            if mixed_sheet_df is not None
            else pd.read_excel(path, sheet_name=mixed_sheet, dtype=str)
        )
        if looks_like_nrc_wide_case_plus_service(raw):
            return split_nrc_cash_assistance_wide(raw)
        if row_type_col:
            return split_by_explicit_row_type(raw, row_type_col)
        return split_by_service_columns(raw)

    # تخمين أسماء التبويبات (يستخدم المعامل path وليس مساراً ثابتاً في الكود)
    xl = pd.ExcelFile(path)
    names_lower = {n.lower(): n for n in xl.sheet_names}

    def pick(*options: str) -> str | None:
        for o in options:
            key = o.lower()
            if key in names_lower:
                return names_lower[key]
        return None

    cname = pick("cases", "case", "الحالات", "sheet1")
    sname = pick("services", "service", "الخدمات", "sheet2")

    if cname and sname and cname != sname:
        return (
            pd.read_excel(path, sheet_name=cname, dtype=str),
            pd.read_excel(path, sheet_name=sname, dtype=str),
        )

    for sheet in xl.sheet_names:
        probe = pd.read_excel(path, sheet_name=sheet, dtype=str, nrows=2)
        if looks_like_nrc_wide_case_plus_service(probe):
            raw = pd.read_excel(path, sheet_name=sheet, dtype=str)
            return split_nrc_cash_assistance_wide(raw)

    if len(xl.sheet_names) == 1:
        raw = pd.read_excel(path, sheet_name=xl.sheet_names[0], dtype=str)
        if looks_like_nrc_wide_case_plus_service(raw):
            return split_nrc_cash_assistance_wide(raw)
        if row_type_col:
            return split_by_explicit_row_type(raw, row_type_col)
        return split_by_service_columns(raw)

    raise ValueError(
        "Could not infer sheets. Pass cases_sheet= and services_sheet=, "
        "or mixed_sheet= (+ optional row_type_col=). "
        f"Available sheets: {xl.sheet_names}"
    )