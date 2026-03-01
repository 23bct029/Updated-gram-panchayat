#!/bin/bash

# Get citizen token
CTOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"citizen@example.com","password":"password","userType":"citizen"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

echo "=== CITIZEN DASHBOARD ==="
echo "Token: ${CTOKEN:0:20}..."

curl -s -H "Authorization: Bearer $CTOKEN" http://localhost:3000/api/citizen/applications 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    apps = data.get('applications', [])
    print(f'Applications: {len(apps)}')
    statuses = {}
    for app in apps:
        s = app.get('status')
        statuses[s] = statuses.get(s, 0) + 1
    for s, c in sorted(statuses.items()):
        print(f'  - {s}: {c}')
except:
    print('Error parsing response')
"

echo ""
echo "=== STAFF DASHBOARD ==="
# Get staff token  
STOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"staff@panchayat.gov","password":"password","userType":"staff"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

echo "Token: ${STOKEN:0:20}..."

curl -s -H "Authorization: Bearer $STOKEN" http://localhost:3000/api/staff/applications 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    apps = data.get('applications', [])
    print(f'Applications: {len(apps)}')
    statuses = {}
    for app in apps:
        s = app.get('status')
        statuses[s] = statuses.get(s, 0) + 1
    for s, c in sorted(statuses.items()):
        print(f'  - {s}: {c}')
except Exception as e:
    print(f'Error: {e}')
"

