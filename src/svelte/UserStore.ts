import { SupabaseClient, User, Subscription } from '@supabase/supabase-js';
import { writable, Writable } from 'svelte/store';

type UserFetcher = (
  url: string
) => Promise<{ user: User | null; accessToken: string | null }>;

const userFetcher: UserFetcher = async (url) => {
  const response = await fetch(url);
  return response.ok ? response.json() : { user: null, accessToken: null };
};

export interface Props {
  supabaseClient: SupabaseClient;
  callbackUrl?: string;
  profileUrl?: string;
  user?: User;
  fetcher?: UserFetcher;
  [propName: string]: any;
}

interface UserStore {
  isLoading: Writable<boolean>;
  user: Writable<User | null>;
  accessToken: Writable<string | null>;
  error: Writable<Error>;
  checkAuthState: () => Subscription | null;
  runOnPathChange: () => Promise<void>;
}

const createUserStore = (props: Props) => {
  const {
    supabaseClient,
    callbackUrl = '/api/auth/callback',
    profileUrl = '/api/auth/user',
    user: initialUser = null,
    fetcher = undefined
  } = props;

  const user = writable<User | null>(initialUser);
  const accessToken = writable<string | null>(null);
  const isLoading = writable<boolean>(!initialUser);
  const error = writable<Error>();

  const checkSession = async (): Promise<void> => {
    try {
      const { user: usr, accessToken: accToken } =
        fetcher !== undefined
          ? await fetcher(profileUrl)
          : await userFetcher(profileUrl);

      if (accToken) {
        supabaseClient.auth.setAuth(accToken);
        accessToken.set(accToken);
      }
      user.set(usr);
      if (!usr) isLoading.set(false);
    } catch (e) {
      const err = new Error(`The request to ${profileUrl} failed`);
      error.set(err);
    }
  };

  async function runOnPathChange() {
    isLoading.set(true);
    await checkSession();
    isLoading.set(false);
  }

  const checkAuthState = () => {
    const { data: authListener } = supabaseClient.auth.onAuthStateChange(
      async (event, session) => {
        isLoading.set(true);
        // Forward session from client to server where it is set in a Cookie.
        // NOTE: this will eventually be removed when the Cookie can be set differently.
        await fetch(callbackUrl, {
          method: 'POST',
          headers: new Headers({ 'Content-Type': 'application/json' }),
          credentials: 'same-origin',
          body: JSON.stringify({ event, session })
        }).then((res) => {
          if (!res.ok) {
            const err = new Error(`The request to ${callbackUrl} failed`);
            error.set(err);
          }
        });
        // Fetch the user from the API route
        await checkSession();
        isLoading.set(false);
      }
    );

    return authListener;
  };

  return {
    isLoading,
    user,
    accessToken,
    error,
    checkAuthState,
    runOnPathChange
  };
};

let user: UserStore;

export const UserStore = (props: Props) => {
  if (user === undefined) {
    user = createUserStore(props);
  }
  return user;
};
