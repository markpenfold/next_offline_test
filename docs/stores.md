# The various Zustand stores in play

We have 4 Stores:
1. AppStoreProvider -> AppStore
2. UIStore
3. ConnectivityStore
4. DATASTore

![Data Stores](images/stores.png

### The AppStore manages a lot of state:
```
                     AppStore
                        │
        ┌───────────────┼────────────────┐
        │               │                │
      Auth            Account           Lease
        │               │                │
        ├───────────────┼────────────────┤
        │               │                │
   initialization   tier changes    offline fallback
```

 * The provider ensures we have one global store for these state variables
 * It injects these variables into any component that asks:

	 ```ts
	const authStatus = useAppStore(
	  state => state.authStatus
	);
	 ```
That does two things:
1. retrieve AppStore from the Provider's context

2. subscribe to the variable: "I care about authStatus. Tell React when this value changes."

 ### SO {children} can access Auth/Account/Lease

 ```ts
function AppStoreProvider({ children }) {
  const storeRef = useRef(null);

  if (!storeRef.current) {
    storeRef.current = createAppStore();
  }

  return (
    <AppStoreContext.Provider value={storeRef.current}>
      {children}
    </AppStoreContext.Provider>
  );
}
 ```

 ### The Provider's job is to say:

"For this React subtree, __this__ is the AppStore instance you should use."






































