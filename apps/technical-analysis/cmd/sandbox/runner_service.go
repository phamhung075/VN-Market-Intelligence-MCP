package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
)

// ---------------------------------------------------------------------------
// Service tier — httptest.NewServer runner
// ---------------------------------------------------------------------------

func runServiceScenario(scenarioPath string) (actual interface{}, diffs []string, err error) {
	data, readErr := os.ReadFile(scenarioPath)
	if readErr != nil {
		return nil, nil, fmt.Errorf("read service scenario: %w", readErr)
	}
	var sc serviceScenario
	if parseErr := json.Unmarshal(data, &sc); parseErr != nil {
		return nil, nil, fmt.Errorf("parse service scenario: %w", parseErr)
	}

	srv, closeSrv := newTestServer()
	defer closeSrv()

	url := srv.URL + sc.Input.Path

	bodyReader, bodyErr := buildServiceRequestBody(sc)
	if bodyErr != nil {
		return nil, nil, bodyErr
	}

	req, reqErr := http.NewRequest(sc.Input.Method, url, bodyReader)
	if reqErr != nil {
		return nil, nil, fmt.Errorf("build request: %w", reqErr)
	}
	if sc.Input.Method == http.MethodPost {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, doErr := http.DefaultClient.Do(req)
	if doErr != nil {
		return nil, nil, fmt.Errorf("http request: %w", doErr)
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)

	// Parse response body as JSON.
	var respBody map[string]interface{}
	_ = json.Unmarshal(bodyBytes, &respBody)

	actual = map[string]interface{}{
		"statusCode": resp.StatusCode,
		"body":       respBody,
	}

	diffs = applyServiceDiffs(sc.Expected, resp.StatusCode, respBody)

	return actual, diffs, nil
}
