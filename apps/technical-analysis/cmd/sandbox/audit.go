package main

import (
	"fmt"
	"os"
	"strings"
)

// ---------------------------------------------------------------------------
// Env audit gate
// ---------------------------------------------------------------------------

var forbiddenEnvPrefixes = []string{
	"DB_", "API_KEY", "SECRET", "TOKEN", "PASSWORD",
}

func runAuditGate() {
	keys := os.Environ()
	var auditedKeys []string
	var forbidden []string
	for _, kv := range keys {
		k := strings.SplitN(kv, "=", 2)[0]
		auditedKeys = append(auditedKeys, k)
		for _, prefix := range forbiddenEnvPrefixes {
			if strings.HasPrefix(strings.ToUpper(k), prefix) {
				forbidden = append(forbidden, k)
			}
		}
	}
	fmt.Printf("audited_env_keys: %s\n", strings.Join(auditedKeys, ","))
	fmt.Printf("forbidden_matches: %s\n", strings.Join(forbidden, ","))
	if len(forbidden) > 0 {
		fmt.Fprintf(os.Stderr, "AUDIT FAIL: credential(s) found in sandbox env: %v\n", forbidden)
		os.Exit(2)
	}
}
