PACKAGES=$(subst /,-,$(shell find * -maxdepth 1 -mindepth 1 -type d))
BUILD_PLATFORM=$(or ${PLATFORM},baremetal-$(shell grep -oP "^ID=\K.+" /etc/os-release))


help:
	@echo "You probably don't want to build all package"
	@echo "If you do run $`make [PLATFORM=<platform>] build-all$`"
	@echo 
	@echo "Run $`make [PLATFORM=<platform>] list$` to list all packages availables"
	@echo 
	@echo "Run $`make [PLATFORM=<platform>] <language>-<version>.pkg.tar.gz$` to build a specific language"

list:
	@echo "Platform: ${BUILD_PLATFORM}"
	@echo "Packages: ${PACKAGES}"


build build-all: $(addsuffix .pkg.tar.gz, ${PACKAGES})


define PKG_RULE
$(1).pkg.tar.gz: $(subst -,/,$(1)) $(subst -,/,$(1))/pkg-info.json
	@echo "==> Executing build.sh for $(1)..."
	@chmod +x $$</build.sh
	@bash -c "cd $$< && ./build.sh"
	@echo "==> build.sh executed correctly."

	@rm -f $$@

	@echo "==> Packaging $(1)..."
	@tar czf $$@ -C $$< .
	@echo "==> Package $(1).pkg.tar.gz created correctly."
endef

$(foreach pkg,$(PACKAGES),$(eval $(call PKG_RULE,$(pkg))))

%/pkg-info.json: %/metadata.json
	jq '.build_platform="${BUILD_PLATFORM}"' $< > $@

