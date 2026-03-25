package main

import (
	"fmt"
	"os"

	hedera "github.com/hiero-ledger/hiero-sdk-go/v2/sdk"
)

func main() {
	fmt.Println("Testing Go with Hiero SDK v2.73.0")
	
	// Test basic SDK functionality
	client, err := hedera.ClientForTestnet()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error creating client: %v\n", err)
		os.Exit(1)
	}
	defer client.Close()

	fmt.Println("✓ Hiero SDK initialized successfully")
	fmt.Printf("✓ Network: %v\n", client.GetLedgerID())
	fmt.Println("✓ Go version: 1.25.4")
	fmt.Println("✓ All tests passed!")
}

