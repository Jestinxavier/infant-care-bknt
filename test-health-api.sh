#!/bin/bash

# Health Check API Test Script
# This script tests all health check endpoints

echo "🧪 Testing Health Check API Endpoints"
echo "======================================"
echo ""

BASE_URL="http://localhost:3000"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Database Health
echo -e "${YELLOW}Test 1: Database Connection Status${NC}"
echo "GET $BASE_URL/api/v1/health/database"
echo ""
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" "$BASE_URL/api/v1/health/database")
HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')

echo "$BODY" | jq '.'
echo ""

if [ "$HTTP_STATUS" = "200" ]; then
  echo -e "${GREEN}✅ Test 1 PASSED - Database is connected${NC}"
else
  echo -e "${RED}❌ Test 1 FAILED - Status code: $HTTP_STATUS${NC}"
fi

echo ""
echo "======================================"
echo ""

# Test 2: Database Ping
echo -e "${YELLOW}Test 2: Database Ping${NC}"
echo "GET $BASE_URL/api/v1/health/ping"
echo ""
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" "$BASE_URL/api/v1/health/ping")
HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')

echo "$BODY" | jq '.'
echo ""

if [ "$HTTP_STATUS" = "200" ]; then
  RESPONSE_TIME=$(echo "$BODY" | jq -r '.responseTime')
  echo -e "${GREEN}✅ Test 2 PASSED - Database ping successful (${RESPONSE_TIME})${NC}"
else
  echo -e "${RED}❌ Test 2 FAILED - Status code: $HTTP_STATUS${NC}"
fi

echo ""
echo "======================================"
echo ""

# Test 3: Complete Health Status
echo -e "${YELLOW}Test 3: Complete Health Status${NC}"
echo "GET $BASE_URL/api/v1/health/status"
echo ""
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" "$BASE_URL/api/v1/health/status")
HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')

echo "$BODY" | jq '.'
echo ""

if [ "$HTTP_STATUS" = "200" ]; then
  UPTIME=$(echo "$BODY" | jq -r '.server.uptime')
  DB_STATUS=$(echo "$BODY" | jq -r '.database.status')
  echo -e "${GREEN}✅ Test 3 PASSED - Server uptime: ${UPTIME}, Database: ${DB_STATUS}${NC}"
else
  echo -e "${RED}❌ Test 3 FAILED - Status code: $HTTP_STATUS${NC}"
fi

echo ""
echo "======================================"
echo ""
echo -e "${GREEN}🎉 Health Check API Testing Complete!${NC}"
echo ""
