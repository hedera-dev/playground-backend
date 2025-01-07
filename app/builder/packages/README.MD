# Builder Packages
Use `Makefile` script to build packages on a specific platform. You can define the build platform using the **PLATFORM** variable.

## Usage
```bash
# List packages:
make PLATFORM=debian list

# Build packages:
make PLATFORM=debian build-[name]-[version]

# For more help:
make help
```

