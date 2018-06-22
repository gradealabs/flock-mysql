.PHONY: test
test:
	@./node_modules/.bin/mocha \
		-r dotenv/config \
		-r ts-node/register \
		--exit \
		./src/**/*.test.ts

.PHONY: build
build:
	@./node_modules/.bin/tsc -p .
	@cp -R src/templates lib

.PHONY: clean
clean:
	@rm -fr lib
