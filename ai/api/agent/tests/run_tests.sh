#!/bin/bash

# Script to run agent API endpoint tests
# Usage: ./run_tests.sh [document_id]

# Get document ID from command line argument or use default
DOCUMENT_ID=${1:-"00000000-0000-0000-0000-000000000000"}

# Set environment variables for test
export API_BASE_URL="http://localhost:8000"
export API_USERNAME="admin"
export API_PASSWORD="password"
export TEST_DOCUMENT_ID="$DOCUMENT_ID"

# Print test configuration
echo "Running tests with configuration:"
echo "API Base URL: $API_BASE_URL"
echo "Document ID: $DOCUMENT_ID"
echo "Username: $API_USERNAME"

# Change to the root directory (ai/api)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../.."

# Install required dependencies if needed
if ! python -c "import httpx" &> /dev/null; then
    echo "Installing required dependencies..."
    pip install httpx
fi

# Run the tests
echo "Starting API endpoint tests..."
python -m ai.api.agent.tests.test_endpoints

# Store exit code
EXIT_CODE=$?

# Print final result
if [ $EXIT_CODE -eq 0 ]; then
    echo -e "\n✅ All tests passed!"
else
    echo -e "\n❌ Some tests failed!"
fi

exit $EXIT_CODE 