// expo-notifications adds Apple's Push Notifications permission (aps-environment) to the iOS build. Apple only
// grants it for an app ID the team owns, and com.lifequest.app isn't ours, so signing fails. Daily reminders are
// local notifications and don't need it. Remove this plugin once the app has its own ID and remote push.
const { withEntitlementsPlist } = require("expo/config-plugins");

module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, cfg => {
    delete cfg.modResults["aps-environment"];
    return cfg;
  });
};
