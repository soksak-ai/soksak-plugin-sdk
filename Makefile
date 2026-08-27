SHELL := /bin/sh
.PHONY: preflight prepare build verify

preflight:
	@scripts/check-build-environment.sh

prepare: preflight
	@CI=1 PNPM_DISABLE_SELF_UPDATE_CHECK=1 pnpm install --frozen-lockfile

build: prepare
	@CI=1 PNPM_DISABLE_SELF_UPDATE_CHECK=1 pnpm build

verify: prepare
	@CI=1 PNPM_DISABLE_SELF_UPDATE_CHECK=1 pnpm test
