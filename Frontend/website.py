import requests
import pandas as pd
import re
import os
from datetime import datetime

URL = "https://lifemakers.odoo.com/powerbi/sql"
HEADERS = {
    "Content-Type": "application/json"
}
TIMEZONE = "Africa/Cairo"
REQUEST_TIMEOUT_SECONDS = 60

# Your SQL query
query = """
    SELECT
    Project,
    Month,
    SUM(ServicesCreated) AS ServicesCreated,
    SUM(ServicesDone) AS ServicesDone
FROM
    (SELECT 
        implementation_teams.name AS Project,
        TO_CHAR(case_implementation.create_date, 'YYYY-MM') AS Month,
        COUNT(case_implementation.id) AS ServicesCreated,
        0 AS ServicesDone
    FROM case_implementation 
    LEFT JOIN case_implementation_implementation_teams_rel 
        ON case_implementation.id = case_implementation_implementation_teams_rel.case_implementation_id 
    LEFT JOIN implementation_teams 
        ON implementation_teams.id = case_implementation_implementation_teams_rel.implementation_teams_id
    WHERE (case_implementation.create_date IS NOT NULL AND TO_CHAR(case_implementation.create_date, 'YYYY-MM') >= '2026-01')
	AND implementation_teams.name IN ('Basic Need','Emergency Team','Humanitarian Assistance Team', 'Dafa 2025', 'Sawa','NRC','Steps Forward','Qift Project')
    GROUP BY implementation_teams.name, TO_CHAR(case_implementation.create_date, 'YYYY-MM')

    UNION ALL
    
    SELECT 
        implementation_teams.name AS Project,
        TO_CHAR(case_implementation.actual_date, 'YYYY-MM') AS Month,
        0 AS ServicesCreated,
        COUNT(case_implementation.id) AS ServicesDone
    FROM case_implementation 
    LEFT JOIN case_implementation_implementation_teams_rel 
        ON case_implementation.id = case_implementation_implementation_teams_rel.case_implementation_id 
    LEFT JOIN implementation_teams 
        ON implementation_teams.id = case_implementation_implementation_teams_rel.implementation_teams_id
    WHERE (case_implementation.actual_date IS NOT NULL AND TO_CHAR(case_implementation.actual_date, 'YYYY-MM') >= '2026-01')
	AND implementation_teams.name IN ('Basic Need','Emergency Team','Humanitarian Assistance Team', 'Dafa 2025', 'Sawa','NRC','Steps Forward','Qift Project')
    GROUP BY implementation_teams.name, TO_CHAR(case_implementation.actual_date, 'YYYY-MM')
) AS combined
GROUP BY Project, Month
ORDER BY Month DESC, Project
"""

payload = {
    "jsonrpc": "2.0",
    "method": "execute",
    "params": {
        "token": "4479cd5aeec04c7b931406abba84cca071c7092959f49820dfd751ec623cbfb6",
        "query": query
    },
    "id": 1
}

# Extract column names from the SELECT statement
def get_columns_from_query(sql_query):
    # Find the SELECT part (case insensitive)
    select_match = re.search(r'SELECT\s+(?:DISTINCT\s+)?(.*?)\s+FROM', sql_query, re.IGNORECASE | re.DOTALL)
    if not select_match:
        return []
    
    select_part = select_match.group(1)
    columns = []
    
    # Split by comma, but be careful with nested parentheses
    current_col = ""
    paren_count = 0
    
    for char in select_part:
        if char == '(':
            paren_count += 1
            current_col += char
        elif char == ')':
            paren_count -= 1
            current_col += char
        elif char == ',' and paren_count == 0:
            # This is a column separator
            col = current_col.strip()
            if col:
                # Extract column name after AS keyword if present
                if ' AS ' in col.upper():
                    parts = re.split(r'\s+AS\s+', col, flags=re.IGNORECASE)
                    if len(parts) > 1:
                        col = parts[-1].strip()
                else:
                    # If no AS, try to get the last part after dot
                    col = col.split('.')[-1].strip()
                columns.append(col)
            current_col = ""
        else:
            current_col += char
    
    # Add the last column
    if current_col.strip():
        col = current_col.strip()
        if ' AS ' in col.upper():
            parts = re.split(r'\s+AS\s+', col, flags=re.IGNORECASE)
            if len(parts) > 1:
                col = parts[-1].strip()
        else:
            col = col.split('.')[-1].strip()
        columns.append(col)
    
    return columns

def get_output_path(filename):
    output_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(output_dir, filename)


def build_dataframe(result, columns):
    if not isinstance(result, list):
        return None

    if not result:
        return pd.DataFrame(columns=columns or None)

    if isinstance(result[0], dict):
        return pd.DataFrame(result)

    if columns:
        return pd.DataFrame(result, columns=columns)

    return pd.DataFrame(result)


def convert_datetime_columns(df, timezone):
    datetime_cols = [
        col for col in df.columns
        if 'date' in col.lower() or 'time' in col.lower() or 'check' in col.lower()
    ]

    for col in datetime_cols:
        series = pd.to_datetime(df[col], errors='coerce', utc=True)
        if series.notna().any():
            df[col] = series.dt.tz_convert(timezone)


def main():
    column_names = get_columns_from_query(query)

    with requests.Session() as session:
        response = session.post(
            URL,
            json=payload,
            headers=HEADERS,
            timeout=REQUEST_TIMEOUT_SECONDS
        )

    try:
        response.raise_for_status()
        data = response.json()
    except requests.HTTPError:
        print("Request failed. Response:")
        print(response.text)
        return
    except ValueError:
        print("Response is not valid JSON. Raw response:")
        print(response.text)
        return

    result = data.get("result")
    df = build_dataframe(result, column_names)
    if df is None:
        print("No 'result' key found or data is not a list. Full response:")
        print(data)
        return

    convert_datetime_columns(df, TIMEZONE)

    print("Data with corrected timezones:")
    try:
        print(df.head())
    except UnicodeEncodeError:
        print(f"DataFrame shape: {df.shape}")
        print(f"Columns: {list(df.columns)}")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    excel_filename = f"website_data_{timestamp}.xlsx"
    output_path = get_output_path(excel_filename)
    df.to_excel(output_path, index=False, engine='openpyxl')
    print(f"\nData saved to {output_path}")
    print(f"Total rows: {len(df)}")


if __name__ == "__main__":
    main()