# Power BI Desktop Connection Documentation
## Connection: PBIDesktop-NGOs Result-60366

### Connection Details

| Property | Value |
|----------|-------|
| **Connection Name** | `PBIDesktop-NGOs Result-60366` |
| **Server** | `localhost:60366` |
| **Database Name** | `22eb30e3-b6a4-48a3-84b9-017da222a6a8` |
| **Connection Type** | Power BI Desktop (Local) |
| **Connection String** | `Data Source=localhost:60366;Application Name=MCP-PBIModeling` |
| **Is Cloud Connection** | No |
| **Is Offline** | No |
| **Connected At** | 2026-01-16T23:44:55.3568575Z |
| **Last Used At** | 2026-01-16T23:48:27.2389166Z |
| **Session ID** | `1F5CE152-491F-428B-9158-3AEE14B9E90E` |

### Model Information

| Property | Value |
|----------|-------|
| **Model Name** | `Model` |
| **Modified Time** | 2024-05-26T10:23:01.086667 |
| **Structure Modified** | 2024-07-10T08:25:19.353333 |
| **Culture** | `en-US` |
| **Default Mode** | Import |
| **Default Data View** | Full |
| **Time Intelligence Enabled** | Yes (✓) |

### Model Settings

- **Force Unique Names**: No
- **Discourage Implicit Measures**: No
- **Discourage Report Measures**: No
- **Data Source Default Max Connections**: 10
- **Default Power BI Data Source Version**: PowerBI_V3

### Tables Overview

The model contains **2 tables**:

#### 1. Stats 1
- **Table Name**: `Stats 1`
- **Columns**: 10
- **Partitions**: 1
- **Hierarchies**: 0
- **Measures**: 0

**Columns in Stats 1:**
| Column Name | Data Type | Description |
|------------|-----------|-------------|
| `م` | Int64 | (Arabic column name) |
| `الجمعية` | String | Organization/Society name (Arabic) |
| `أهداف التدريب و المادة التدريبية` | Double | Training objectives and training material (Arabic) |
| `تقييم المدرب` | Double | Trainer evaluation (Arabic) |
| `النواحي الادارية للتدريب` | Double | Administrative aspects of training (Arabic) |
| `All 3` | Double | All 3 (English) |
| `قبلي` | Double | Before/Previous (Arabic) |
| `بعدي ` | Double | After/Subsequent (Arabic) |
| `نسبة التحسن` | Double | Improvement percentage (Arabic) |
| `نسبة التغطية` | Double | Coverage percentage (Arabic) |

#### 2. DateTableTemplate_826df222-3321-4c77-bea8-3b354015f56e
- **Table Name**: `DateTableTemplate_826df222-3321-4c77-bea8-3b354015f56e`
- **Columns**: 7
- **Partitions**: 1
- **Hierarchies**: 1
- **Measures**: 0

**Columns in DateTableTemplate:**
| Column Name | Data Type | Is Calculated | Description |
|------------|-----------|---------------|-------------|
| `Date` | DateTime | No | Date column |
| `Year` | Int64 | Yes | Year (calculated) |
| `MonthNo` | Int64 | Yes | Month number (calculated) |
| `Month` | String | Yes | Month name (calculated) |
| `QuarterNo` | Int64 | Yes | Quarter number (calculated) |
| `Quarter` | String | Yes | Quarter name (calculated) |
| `Day` | Int64 | Yes | Day (calculated) |

### Measures

Currently, the model has **0 measures** defined.

### Relationships

Currently, the model has **0 relationships** defined.

### Model Annotations

- **PBI_QueryOrder**: `["Stats 1"]`
- **__PBI_TimeIntelligenceEnabled**: `1`

### Connection Usage

#### Connecting via MCP

```json
{
  "operation": "Connect",
  "connectionString": "Data Source=localhost:60366;Application Name=MCP-PBIModeling"
}
```

#### List Local Instances

Before connecting, you can check for available Power BI Desktop instances:

```json
{
  "operation": "ListLocalInstances"
}
```

#### Get Connection Details

```json
{
  "operation": "GetConnection",
  "connectionName": "PBIDesktop-NGOs Result-60366"
}
```

### Notes

- This is an Arabic data model focused on NGO (Non-Governmental Organization) training statistics
- The main data table `Stats 1` contains training evaluation metrics in Arabic
- A date table template exists for time intelligence operations
- No relationships are currently defined between tables
- No measures are currently defined in the model

### Model Structure Summary

```
Model
├── Stats 1 (Data Table)
│   ├── 10 Columns (including Arabic column names)
│   └── Training evaluation metrics
│
└── DateTableTemplate_826df222-3321-4c77-bea8-3b354015f56e (Date Table)
    ├── 7 Columns (6 calculated)
    └── 1 Hierarchy
```

---
*Documentation generated: 2026-01-17*
*Last updated based on connection: PBIDesktop-NGOs Result-60366*