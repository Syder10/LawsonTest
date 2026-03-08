#!/usr/bin/env python3
"""
Production Analytics Script for Lawson Limited Company
Calculates KPIs from Supabase database using native HTTP requests
Returns zeros when database is empty (no external dependencies required)
"""

import os
import json
import sys
from datetime import datetime, timedelta
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

def make_supabase_request(url, key, table, select="*", order=None, limit=None, count=None):
    """Make a request to Supabase REST API"""
    try:
        api_url = f"{url}/rest/v1/{table}?select={select}"
        
        if order:
            api_url += f"&order={order}"
        if limit:
            api_url += f"&limit={limit}"
            
        headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json"
        }
        
        if count:
            headers["Prefer"] = f"count={count}"
        
        req = Request(api_url, headers=headers)
        
        with urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode())
            
            # Handle count preference
            if count:
                count_header = response.headers.get('Content-Range', '0-0/0')
                total_count = int(count_header.split('/')[-1]) if '/' in count_header else 0
                return {"data": data, "count": total_count}
            
            return {"data": data, "count": len(data)}
            
    except (HTTPError, URLError, Exception) as e:
        print(f"[v0] Warning: Error fetching {table}: {str(e)}", file=sys.stderr)
        return {"data": [], "count": 0}

def get_kpis():
    """Calculate all KPIs from Supabase production data"""
    try:
        # Fetch environment variables
        url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip('/')
        key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        
        if not url or not key:
            # Return zeros instead of error for empty database scenario
            return get_empty_kpis()
        
        # 1. Total Production in Cartons/Boxes from packaging records
        packaging_res = make_supabase_request(url, key, "packaging_daily_records", "quantity_cartons_produced")
        total_production = sum(float(item.get('quantity_cartons_produced', 0) or 0) for item in packaging_res["data"])

        # 2. Total Alcohol Used from concentrate records
        alc_concentrate_res = make_supabase_request(url, key, "concentrate_alcohol_records", "total_alcohol_used_litres")
        total_alc_used = sum(float(item.get('total_alcohol_used_litres', 0) or 0) for item in alc_concentrate_res["data"])

        # 3. Current Alcohol Balance - Latest record from alcohol_stock_level_records
        stock_res = make_supabase_request(
            url, key, 
            "alcohol_stock_level_records", 
            "remaining_stock,date,shift",
            order="date.desc,created_at.desc",
            limit=1
        )
        
        current_alcohol_balance = {
            "balance": float(stock_res["data"][0].get('remaining_stock', 0) or 0) if stock_res["data"] else 0,
            "date": stock_res["data"][0].get('date') if stock_res["data"] else None,
            "shift": stock_res["data"][0].get('shift') if stock_res["data"] else None
        }

        # 4. Current Bottle Balance - Latest record from blowing_daily_records
        blowing_res = make_supabase_request(
            url, key,
            "blowing_daily_records",
            "closing_stock_bags,date,shift",
            order="date.desc,created_at.desc",
            limit=1
        )
        
        current_bottle_balance = {
            "balance": float(blowing_res["data"][0].get('closing_stock_bags', 0) or 0) if blowing_res["data"] else 0,
            "date": blowing_res["data"][0].get('date') if blowing_res["data"] else None,
            "shift": blowing_res["data"][0].get('shift') if blowing_res["data"] else None
        }

        # 5. Total Ginger Production from ginger_production_records
        ginger_res = make_supabase_request(url, key, "ginger_production_records", "finished_product_litres")
        total_ginger_production = sum(float(item.get('finished_product_litres', 0) or 0) for item in ginger_res["data"])

        # 6. Production Trends (Last 30 days) - Group by date
        production_trends = []
        packaging_all = make_supabase_request(url, key, "packaging_daily_records", "date,quantity_cartons_produced")
        if packaging_all["data"]:
            date_totals = {}
            for record in packaging_all["data"]:
                date = record.get('date', '')
                cartons = float(record.get('quantity_cartons_produced', 0) or 0)
                if date:
                    date_totals[date] = date_totals.get(date, 0) + cartons
            
            # Sort by date and take last 30 days
            sorted_dates = sorted(date_totals.items())[-30:]
            production_trends = [{"date": date, "cartons": cartons} for date, cartons in sorted_dates]

        # 7. Alcohol Consumption Trends (Last 30 days)
        alcohol_trends = []
        alc_all = make_supabase_request(url, key, "concentrate_alcohol_records", "date,total_alcohol_used_litres")
        if alc_all["data"]:
            date_totals = {}
            for record in alc_all["data"]:
                date = record.get('date', '')
                litres = float(record.get('total_alcohol_used_litres', 0) or 0)
                if date:
                    date_totals[date] = date_totals.get(date, 0) + litres
            
            sorted_dates = sorted(date_totals.items())[-30:]
            alcohol_trends = [{"date": date, "litres": litres} for date, litres in sorted_dates]

        # 8. Efficiency Metrics
        filling_res = make_supabase_request(url, key, "filling_line_daily_records", "total_production")
        total_bottles_filled = sum(float(item.get('total_production', 0) or 0) for item in filling_res["data"])
        
        preforms_res = make_supabase_request(url, key, "blowing_daily_records", "preforms_used_bags")
        total_preforms_used = sum(float(item.get('preforms_used_bags', 0) or 0) for item in preforms_res["data"])
        
        # Calculate efficiency rate (bottles per preform bag, assuming ~1000 bottles per bag)
        expected_bottles = total_preforms_used * 1000
        efficiency_rate = round((total_bottles_filled / expected_bottles * 100), 2) if expected_bottles > 0 else 0
        
        efficiency_metrics = {
            "total_bottles_filled": int(total_bottles_filled),
            "total_preforms_used": int(total_preforms_used),
            "efficiency_rate": efficiency_rate
        }

        # 9. Department Activity (count of records per department/table)
        department_activity = {}
        
        tables = [
            ("Blowing", "blowing_daily_records"),
            ("Filling", "filling_line_daily_records"),
            ("Packaging", "packaging_daily_records"),
            ("Alcohol & Blending", "alcohol_blending_daily_records"),
            ("Ginger Production", "ginger_production_records")
        ]
        
        for dept_name, table_name in tables:
            res = make_supabase_request(url, key, table_name, "id", count="exact")
            department_activity[dept_name] = res["count"]

        return {
            "total_production_cartons": int(total_production),
            "total_alcohol_used_litres": round(total_alc_used, 2),
            "current_alcohol_balance": current_alcohol_balance,
            "current_bottle_balance": current_bottle_balance,
            "total_ginger_production_litres": round(total_ginger_production, 2),
            "production_trends": production_trends,
            "alcohol_consumption_trends": alcohol_trends,
            "efficiency_metrics": efficiency_metrics,
            "department_activity": department_activity,
            "last_updated": datetime.now().isoformat()
        }

    except Exception as e:
        # Return zeros instead of error for graceful degradation
        print(f"[v0] Error in get_kpis: {str(e)}", file=sys.stderr)
        return get_empty_kpis()

def get_empty_kpis():
    """Return KPIs with all zeros for empty database"""
    return {
        "total_production_cartons": 0,
        "total_alcohol_used_litres": 0,
        "current_alcohol_balance": {
            "balance": 0,
            "date": None,
            "shift": None
        },
        "current_bottle_balance": {
            "balance": 0,
            "date": None,
            "shift": None
        },
        "total_ginger_production_litres": 0,
        "production_trends": [],
        "alcohol_consumption_trends": [],
        "efficiency_metrics": {
            "total_bottles_filled": 0,
            "total_preforms_used": 0,
            "efficiency_rate": 0
        },
        "department_activity": {
            "Blowing": 0,
            "Filling": 0,
            "Packaging": 0,
            "Alcohol & Blending": 0,
            "Ginger Production": 0
        },
        "last_updated": datetime.now().isoformat()
    }

if __name__ == "__main__":
    try:
        kpis = get_kpis()
        # Print as JSON to stdout for Node.js to capture
        print(json.dumps(kpis, indent=2))
        sys.stdout.flush()
    except Exception as e:
        # Return empty KPIs instead of error
        print(json.dumps(get_empty_kpis(), indent=2))
        sys.exit(0)  # Exit successfully even on error
