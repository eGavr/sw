package sw.keycloak;

import com.fasterxml.jackson.databind.JsonNode;
import org.keycloak.broker.oidc.AbstractOAuth2IdentityProvider;
import org.keycloak.broker.oidc.OAuth2IdentityProviderConfig;
import org.keycloak.broker.oidc.mappers.AbstractJsonUserAttributeMapper;
import org.keycloak.broker.provider.BrokeredIdentityContext;
import org.keycloak.broker.provider.IdentityBrokerException;
import org.keycloak.broker.provider.util.SimpleHttp;
import org.keycloak.broker.social.SocialIdentityProvider;
import org.keycloak.events.EventBuilder;
import org.keycloak.models.KeycloakSession;

// A minimal Keycloak social identity provider for Yandex ID. Yandex is OAuth2 (not OpenID Connect), so it
// does NOT understand the `openid` scope the generic OIDC provider forces, and it returns the user id in a
// non-standard `id` field via login.yandex.ru/info (authenticated with `Authorization: OAuth <token>`, not
// Bearer). This provider speaks that dialect, mirroring Keycloak's built-in GitHub provider.
public class YandexIdentityProvider extends AbstractOAuth2IdentityProvider<OAuth2IdentityProviderConfig>
        implements SocialIdentityProvider<OAuth2IdentityProviderConfig> {

    public static final String AUTH_URL = "https://oauth.yandex.ru/authorize";
    public static final String TOKEN_URL = "https://oauth.yandex.ru/token";
    public static final String PROFILE_URL = "https://login.yandex.ru/info?format=json";
    public static final String DEFAULT_SCOPE = "login:info login:email";

    public YandexIdentityProvider(KeycloakSession session, OAuth2IdentityProviderConfig config) {
        super(session, config);
        config.setAuthorizationUrl(AUTH_URL);
        config.setTokenUrl(TOKEN_URL);
        config.setUserInfoUrl(PROFILE_URL);
    }

    @Override
    protected boolean supportsExternalExchange() {
        return true;
    }

    @Override
    protected String getDefaultScopes() {
        return DEFAULT_SCOPE;
    }

    @Override
    protected String getProfileEndpointForValidation(EventBuilder event) {
        return PROFILE_URL;
    }

    @Override
    protected BrokeredIdentityContext extractIdentityFromProfile(EventBuilder event, JsonNode profile) {
        String id = getJsonProperty(profile, "id");
        BrokeredIdentityContext user = new BrokeredIdentityContext(id, getConfig());

        String login = getJsonProperty(profile, "login");
        user.setUsername(login != null ? login : id);
        user.setEmail(getJsonProperty(profile, "default_email"));
        user.setName(getJsonProperty(profile, "real_name"));
        user.setFirstName(getJsonProperty(profile, "first_name"));
        user.setLastName(getJsonProperty(profile, "last_name"));

        user.setIdp(this);
        AbstractJsonUserAttributeMapper.storeUserProfileForMapper(user, profile, getConfig().getAlias());
        return user;
    }

    @Override
    protected BrokeredIdentityContext doGetFederatedIdentity(String accessToken) {
        try {
            JsonNode profile = SimpleHttp.doGet(PROFILE_URL, session)
                    .header("Authorization", "OAuth " + accessToken)
                    .asJson();
            return extractIdentityFromProfile(null, profile);
        } catch (Exception e) {
            throw new IdentityBrokerException("Could not obtain user profile from Yandex", e);
        }
    }
}
