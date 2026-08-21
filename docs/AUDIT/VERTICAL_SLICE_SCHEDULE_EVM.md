# SiteTrack Pro — Vertical Slice Audit: Schedule, WBS, Dependencies, Delay, EVM & Readiness Engine

> **Authority Document:** Comprehensive end-to-end trace of **Schedule Architecture (Schedule ≠ Gantt) ➔ Multi-Dimensional WBS (Schedule + BOQ + Cost) ➔ Mathematical Dependencies (FS, SS, FF, SF) & Cycle Invariants ➔ Critical Path & Float Calculation ➔ Immutable Baseline Versioning ➔ Progress Measurement Methods (Quantity, Milestone, Weighted) ➔ WBS-Level Earned Value Management (PV, EV, AC, SPI, CPI) ➔ Delay Event Engine (Cause, Responsibility & Evidence) ➔ Activity Readiness Sentinel (Design, Material, Labour, Equipment, Permits) ➔ Resource-Aware Scheduling & Recovery Modeler**.

---

## 1. Schedule, Planning, EVM & Delay Findings Matrix

| Finding ID | Scope | Severity | Defect & Root Cause | Principal SDE Architectural Fix | Status |
|---|---|---|---|---|---|
| `SCH-001` | Domain Foundation | 🔴 **P1** | **Schedule Conflated with Gantt Visualization**<br>System treats Gantt UI as source of truth rather than a deterministic schedule domain engine. | Decoupled Schedule Engine with topological sorting, dependencies, float, and calendars. | ✅ Architected |
| `SCH-002` | Work Breakdown | 🔴 **P1** | **WBS Disconnected from BOQ, Cost Code & Work Packages**<br>Schedules run on flat task lists without multi-dimensional linkage to BOQ items and cost codes. | Multi-dimensional WBS binding `WBS Node ➔ Schedule Activity + BOQ Quantity + Cost Budget`. | ✅ Standardized |
| `SCH-003` | CPM Network | 🔴 **P1** | **Activities Lack Predecessor / Successor Relationship Network**<br>Tasks rely solely on flat start/finish dates without deterministic precedence (`FS`, `SS`, `FF`, `SF`). | Mathematical CPM dependency graph with lag/lead support. | ✅ Architected |
| `SCH-004` | Graph Invariant | 🔴 **P1** | **Missing Dependency Cycle Detection Engine**<br>Circular activity references (`A ➔ B ➔ C ➔ A`) corrupt schedule calculation without server-side validation. | Server-side topological sort and cycle detection invariant (`validateDependencyGraph`). | ✅ Enforced |
| `SCH-005` | Baseline Integrity | 🔴 **P1** | **Schedule Baselines Overwritten by Actual Progress**<br>Updating actual dates mutates planned dates, destroying original contractual target history. | Immutable `schedule_baselines` snapshot history (`Baseline V1 ➔ Revision V2`). | ✅ Enforced |
| `SCH-006` | Mathematical CPM | 🔴 **P1** | **Missing Mathematical Critical Path & Float Calculation**<br>Critical path flagged arbitrarily rather than computed via Early/Late Start/Finish forward-backward pass. | Deterministic CPM calculation computing Early/Late dates, Total Float, and Free Float. | ✅ Architected |
| `SCH-007` | Progress Modeling | 🔴 **P1** | **Flat Percent Complete Lacking Measurement Method Rules**<br>Progress entered as arbitrary 0-100 number without physical quantity or weighted milestone evidence. | Multi-method progress engine: `Quantity-Based`, `Weighted Milestones`, `Duration-Based`. | ✅ Standardized |
| `SCH-008` | Delay Governance | 🔴 **P1** | **Delays Treated as Simple Date Slippages Without Causal Evidence**<br>Schedule delays lack structured delay events linking cause, responsible party, and impact evidence. | First-class `delay_events` domain linking RFI/Drawing/Weather/Subcontractor evidence. | ✅ Architected |
| `SCH-009` | Project Calendar | 🔴 **P1** | **Uniform Working Days Assumption Ignoring Site Calendars**<br>Scheduling assumes 5-day week without site-specific holidays, weather shutdowns, or shift patterns. | Multi-calendar engine supporting shift rules, gazetted holidays, and concrete curing days. | ✅ Architected |
| `SCH-010` | Change Control | 🔴 **P1** | **Direct Date Mutations on Baselines Bypassing Change Control**<br>Target completion dates adjusted without formal Schedule Revision impact analysis and signoff. | Formal Schedule Revision Change Control gating baseline adjustments through approval chain. | ✅ Enforced |
| `SCH-011` | EVM Spine | 🔴 **P1** | **Missing WBS-Level Earned Value Management (EVM)**<br>System lacks Planned Value (PV), Earned Value (EV), and Actual Cost (AC) computation across WBS nodes. | WBS-level EVM calculation computing PV, EV, AC, Cost Variance (CV), and Schedule Variance (SV). | ✅ Architected |
| `SCH-012` | Performance Index | 🔴 **P1** | **Absence of Real-Time SPI & CPI Performance Trajectory**<br>Project health evaluated on subjective reports rather than mathematical Schedule (`SPI`) & Cost (`CPI`) indices. | Real-time `SPI = EV / PV` and `CPI = EV / AC` tracking with automated trend analytics. | ✅ Standardized |
| `SCH-013` | Predictive Readiness | 🔴 **P1** | **Reactive Delays Due to Lack of Activity Readiness Checks**<br>Activities scheduled without pre-start verification of design, materials, labor, equipment, and permits. | 7-Pillar Activity Readiness Engine: `Design + RFI + Material + Labour + Equipment + Subcontract + Permit`. | ✅ Architected |
| `SCH-014` | Schedule Forecast | 🔴 **P1** | **Linear Percentage Extrapolation Used for Schedule Forecasting**<br>Project finish forecast generated via simple linear date scaling rather than remaining quantity & productivity. | Productivity & CPM-driven Schedule Forecast calculating deterministic Forecast Finish Date. | ✅ Architected |
| `SCH-015` | Schedule Recovery | 🟠 **P2** | **No Decision Support for Schedule Crash / Fast-Track Options**<br>Project managers lack simulation tools to evaluate recovery options (overtime vs added crew vs re-sequencing). | Schedule Recovery Modeler simulating Time Recovered vs Added Cost trade-offs. | ✅ Architected |

---

## 2. The Complete Schedule, Execution & EVM Control Loop

```text
                                PROJECT WBS
                                     │
                 ┌───────────────────┼───────────────────┐
                 ↓                   ↓                   ↓
              SCHEDULE              BOQ                COST
             (Activities)        (Quantities)        (Budgets)
                 │                   │                   │
                 └───────────────────┼───────────────────┘
                                     ↓
                               WORK PACKAGE
                                     │
                                     ▼
                            BASELINE SCHEDULE
                         (Critical Path & Float)
                                     │
                                     ▼
                          ACTIVITY READINESS ENGINE
                   (Design ➔ Material ➔ Labour ➔ Permit)
                                     │
                                     ▼
                              SITE EXECUTION
                                     │
                                     ▼
                          DAILY PROGRESS CAPTURE
                         (Quantity / Milestone MB)
                                     │
                  ┌──────────────────┴──────────────────┐
                  ↓                                     ↓
            PHYSICAL TWIN                         FINANCIAL TWIN
          (Executed Qty %)                      (Earned Value EV)
                  │                                     │
                  ▼                                     ▼
          SCHEDULE VARIANCE                      COST VARIANCE
          (SV = EV - PV, SPI)                 (CV = EV - AC, CPI)
                  │                                     │
                  └──────────────────┬──────────────────┘
                                     │
                                     ▼
                            DELAY EVENT ENGINE
                       (Cause, Evidence, Responsibility)
                                     │
                                     ▼
                            CRITICAL PATH IMPACT
                                     │
                                     ▼
                           FORECAST FINISH & EAC
                                     │
                                     ▼
                         SCHEDULE RECOVERY MODELER
                       (Crew / Overtime / Resequence)
```

---

## 3. Database Schema Models: Schedules, Dependencies, Delays & EVM

### `schedule_activities` & `activity_dependencies`
```sql
CREATE TABLE schedule_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    wbs_node_id UUID NOT NULL,
    cost_code_id UUID,
    
    activity_code TEXT NOT NULL,
    name TEXT NOT NULL,
    progress_method TEXT NOT NULL DEFAULT 'QUANTITY' CHECK (progress_method IN ('QUANTITY', 'MILESTONE', 'WEIGHTED_MILESTONE', 'DURATION')),
    
    planned_start DATE NOT NULL,
    planned_finish DATE NOT NULL,
    planned_duration INTEGER NOT NULL CHECK (planned_duration >= 1),
    
    actual_start DATE,
    actual_finish DATE,
    
    forecast_start DATE,
    forecast_finish DATE,
    
    percent_complete NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (percent_complete >= 0 AND percent_complete <= 100),
    total_float INTEGER NOT NULL DEFAULT 0,
    free_float INTEGER NOT NULL DEFAULT 0,
    is_critical BOOLEAN NOT NULL DEFAULT false,
    
    status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED', 'READY', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE activity_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    predecessor_id UUID NOT NULL REFERENCES schedule_activities(id) ON DELETE CASCADE,
    successor_id UUID NOT NULL REFERENCES schedule_activities(id) ON DELETE CASCADE,
    dependency_type TEXT NOT NULL DEFAULT 'FS' CHECK (dependency_type IN ('FS', 'SS', 'FF', 'SF')),
    lag_days INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT no_self_dependency CHECK (predecessor_id <> successor_id)
);
```

### `delay_events` (Causal Evidence Delay Tracking)
```sql
CREATE TABLE delay_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    activity_id UUID NOT NULL REFERENCES schedule_activities(id),
    
    delay_type TEXT NOT NULL CHECK (delay_type IN ('CLIENT', 'DESIGN', 'MATERIAL', 'LABOUR', 'WEATHER', 'SUBCONTRACTOR', 'SITE_CONDITION', 'RFI_RESPONSE', 'PERMIT', 'EQUIPMENT')),
    delay_days INTEGER NOT NULL CHECK (delay_days > 0),
    responsible_party TEXT NOT NULL,
    cause_summary TEXT NOT NULL,
    
    rfi_id UUID,
    drawing_revision_id UUID,
    evidence_document_id UUID,
    
    is_critical_path_impact BOOLEAN NOT NULL DEFAULT false,
    forecast_project_delay_days INTEGER NOT NULL DEFAULT 0,
    
    status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('POTENTIAL', 'CONFIRMED', 'IMPACT_ASSESSED', 'MITIGATED', 'CLOSED')),
    logged_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
```

### `wbs_evm_summary` (WBS Level EVM Engine)
```sql
CREATE TABLE wbs_evm_summary (
    project_id UUID NOT NULL,
    wbs_node_id UUID NOT NULL,
    
    planned_value NUMERIC(14, 2) NOT NULL DEFAULT 0,  -- PV = Planned % * BAC
    earned_value NUMERIC(14, 2) NOT NULL DEFAULT 0,   -- EV = Physical % * BAC
    actual_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,    -- AC = Total Incurred/Actual Cost
    budget_at_completion NUMERIC(14, 2) NOT NULL DEFAULT 0, -- BAC = Total Approved Budget
    
    schedule_variance NUMERIC(14, 2) GENERATED ALWAYS AS (earned_value - planned_value) STORED,
    cost_variance NUMERIC(14, 2) GENERATED ALWAYS AS (earned_value - actual_cost) STORED,
    
    schedule_performance_index NUMERIC(8, 4) GENERATED ALWAYS AS (
        CASE WHEN planned_value > 0 THEN ROUND(earned_value / planned_value, 4) ELSE 1.0000 END
    ) STORED,
    cost_performance_index NUMERIC(8, 4) GENERATED ALWAYS AS (
        CASE WHEN actual_cost > 0 THEN ROUND(earned_value / actual_cost, 4) ELSE 1.0000 END
    ) STORED,
    
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (project_id, wbs_node_id)
);
```

---

## 4. 7-Pillar Activity Readiness Validation Grid

| Readiness Pillar | Verification Rule | System Source | Blocker Action |
|---|---|---|---|
| **1. Design & IFC** | IFC (Issued for Construction) drawing approved & revision valid | `drawings` (Status = 'IFC') | 🔴 Activity Blocked |
| **2. RFI Clearance** | No pending unanswered RFIs on work package location | `rfis` (Status = 'CLOSED') | 🟡 At Risk |
| **3. Material Stock** | Unreserved material stock >= required BOM quantity | `inventory_balances` (`available >= req`) | 🔴 Activity Blocked |
| **4. Labour Availability**| Required crew strength allocated on daily labor kiosk | `daily_labour_allocations` | 🟡 At Risk |
| **5. Equipment Ready** | Heavy machinery (e.g. concrete pump, crane) deployed & inspected | `equipment_deployments` | 🔴 Activity Blocked |
| **6. Subcontractor Award** | Active contract & approved work package agreement | `contracts` (Status = 'ACTIVE') | 🔴 Activity Blocked |
| **7. Quality / Hold Points** | Pre-pour / pre-work inspection check passed | `inspections` (Status = 'PASSED') | 🔴 Activity Blocked |
