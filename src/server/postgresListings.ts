/**
 * Compatibility re-export for the former PostgreSQL listing adapter.
 *
 * Route ownership and connection configuration now live exclusively in
 * providerListingRepository.ts / providerListingsApi.ts. Keeping this module
 * avoids silently deleting the dirty worktree path while preventing a second
 * pool, configuration variable, or Express route registration.
 */
export {
  ProviderListingRepository,
  ProviderListingRepositoryError,
} from './providerListingRepository';
