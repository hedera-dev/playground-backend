cd /builder/packages

BUILD=1
echo "Running through arguments.."

for pkg in "$@"
do
    shift
    if [[ "$pkg" = "--no-build" ]]; then
        echo "Building no more package"
        BUILD=0
    else
        if [[ $BUILD -eq 1 ]]; then
            echo "Building package $pkg"
            make -j16 $pkg.pkg.tar.gz PLATFORM=docker-debian
            echo "Done with package $pkg"
        else
            echo "Building was disabled, skipping $pkg build=$BUILD"
        fi
    fi
done

cd /builder/src
echo "Creating index"
./mkindex.sh
echo "Index created"
exit 0
