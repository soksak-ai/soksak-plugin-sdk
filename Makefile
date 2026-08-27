SHELL := /bin/sh
.PHONY: preflight prepare build verify package

PACKAGE_OUT ?= $(CURDIR)/artifacts

preflight:
	@scripts/check-build-environment.sh

prepare: preflight
	@CI=1 PNPM_DISABLE_SELF_UPDATE_CHECK=1 pnpm install --frozen-lockfile
	@CI=1 PNPM_DISABLE_SELF_UPDATE_CHECK=1 pnpm dependencies:prepare

build: prepare
	@CI=1 PNPM_DISABLE_SELF_UPDATE_CHECK=1 pnpm build

verify: prepare
	@CI=1 PNPM_DISABLE_SELF_UPDATE_CHECK=1 pnpm test

package: verify
	@node bin/soksak-sdk.mjs package --root "$(CURDIR)" --spec-root "$(CURDIR)/.dependencies/soksak-spec" --commit "$$(git rev-parse --verify HEAD)" --out "$(PACKAGE_OUT)"
