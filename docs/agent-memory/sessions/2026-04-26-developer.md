### Task 1339a: RED phase — PriceConfirmation catalyst correlation fields
- **Files**: `apps/mcp-server/src/__tests__/1339a-price-confirmation-context.test.ts` (created, 142 lines)
- **Finding**: Zod schema strips unknown keys by default — tests 2/10 needed `shape` introspection to fail correctly in RED. Tests 6-8 fail at runtime (TypeError: not a function). Tests 3-5 fail because schema ignores unknown keys pre-implementation.
- **Status**: Ready for QA — 10/10 tests FAIL, 0 source changes, commit 3938320f

### Task: Task 1300b: Memory Update Tools
- **Finding**: Agents need update_memory tool
- **Fix**: Implemented append_session_record
- **Status**: Ready for QA