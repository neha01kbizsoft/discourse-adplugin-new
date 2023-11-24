import EmberObject from "@ember/object";
import AdComponent from "discourse/plugins/discourse-adplugin/discourse/components/ad-component";
import discourseComputed, { observes } from "discourse-common/utils/decorators";
import { isBlank } from "@ember/utils";
import {
  isNthPost,
  isNthTopicListItem,
} from "discourse/plugins/discourse-adplugin/discourse/helpers/slot-position";

const adConfig = EmberObject.create({
  "google-adsense": {
    settingPrefix: "adsense", // settings follow naming convention
    enabledSetting: "adsense_publisher_code",
    nthPost: "adsense_nth_post_code",
  },
  "google-dfp-ad": {
    settingPrefix: "dfp", // settings follow naming convention
    enabledSetting: "dfp_publisher_id",
    nthPost: "dfp_nth_post_code",
  },
  "amazon-product-links": {
    settingPrefix: "amazon",
    enabledSetting: false,
    nthPost: "amazon_nth_post_code",
    desktop: {
      "topic-list-top": "amazon_topic_list_top_src_code",
      "post-bottom": "amazon_post_bottom_src_code",
      "topic-above-post-stream": "amazon_topic_above_post_stream_src_code",
      "topic-above-suggested": "amazon_topic_above_suggested_src_code",
      "side-ad": "amazon_side_ad_src_code",
      "topic-navigation-ad": "amazon_topic_navigation_ad_src_code",
    },
    mobile: {
      "topic-list-top": "amazon_mobile_topic_list_top_src_code",
      "post-bottom": "amazon_mobile_post_bottom_src_code",
      "topic-above-post-stream":
        "amazon_mobile_topic_above_post_stream_src_code",
      "topic-above-suggested": "amazon_mobile_topic_above_suggested_src_code",
      "side-ad":" amazon_mobile_side_ad_src_code",
      "topic-navigation-ad": "amazon_mobile_topic_navigation_ad_src_code",
    },
  },
  "carbonads-ad": {
    settingPrefix: "carbonads",
    enabledSetting: "carbonads_serve_id",
    desktop: {
      "topic-list-top": "carbonads_topic_list_top_enabled",
      "post-bottom": false,
      "topic-above-post-stream": "carbonads_above_post_stream_enabled",
      "topic-above-suggested": false,
      "side-ad":false,
      "topic-navigation-ad": false,
    },
  },
  "adbutler-ad": {
    settingPrefix: "adbutler",
    enabledSetting: "adbutler_publisher_id",
    desktop: {
      "topic-list-top": "adbutler_topic_list_top_zone_id",
      "post-bottom": "adbutler_post_bottom_zone_id",
      "topic-above-post-stream": "adbutler_topic_above_post_stream_zone_id",
      "topic-above-suggested": "adbutler_topic_above_suggested_zone_id",
      "side-ad":"adbutler_side_ad_zone_id",
      "topic-navigation-ad": " adbutler_topic_navigation_ad_zone_id",
    },
    mobile: {
      "topic-list-top": "adbutler_mobile_topic_list_top_zone_id",
      "post-bottom": "adbutler_mobile_post_bottom_zone_id",
      "topic-above-post-stream":
        "adbutler_mobile_topic_above_post_stream_zone_id",
      "topic-above-suggested": "adbutler_mobile_topic_above_suggested_zone_id",
      "side-ad": "adbutler_mobile_side_ad_zone_id",
      "topic-navigation-ad": "adbutler_mobile_topic_navigation_ad_zone_id",
    },
  },
});

const displayCounts = {
  houseAds: 0,
  allAds: 0,
};

function _isNetworkAvailable(siteSettings, enabledNetworkSettingName) {
  // False means there's no setting to enable or disable this ad network.
  // Assume it's always enabled.
  if (enabledNetworkSettingName === false) {
    return true;
  } else {
    return (
      enabledNetworkSettingName &&
      !isBlank(siteSettings[enabledNetworkSettingName])
    );
  }
}

function _shouldPlaceAdInSlot(
  siteSettings,
  currentPostNumber,
  positionToPlace
) {
  return (
    !currentPostNumber ||
    !positionToPlace ||
    isNthPost(parseInt(siteSettings[positionToPlace], 10), currentPostNumber)
  );
}

export function slotContenders(
  site,
  siteSettings,
  placement,
  indexNumber,
  postNumber
) {
  let types = [];
  const houseAds = site.get("house_creatives"),
    placeUnderscored = placement.replace(/-/g, "_");

  if (houseAds && houseAds.settings) {
    const adsForSlot = houseAds.settings[placeUnderscored];

    const adAvailable =
      Object.keys(houseAds.creatives).length > 0 && !isBlank(adsForSlot);

    // postNumber and indexNumber are both null for topic-list-top, topic-above-post-stream,
    // and topic-above-suggested placements. Assume we want to place an ad outside the topic list.
    const notPlacingBetweenTopics = !postNumber && !indexNumber;

    const canBePlacedInBetweenTopics =
      placeUnderscored === "topic_list_between" &&
      isNthTopicListItem(
        parseInt(houseAds.settings.after_nth_topic, 10),
        indexNumber
      );

    if (
      adAvailable &&
      (notPlacingBetweenTopics ||
        canBePlacedInBetweenTopics ||
        isNthPost(parseInt(houseAds.settings.after_nth_post, 10), postNumber))
    ) {
      types.push("house-ad");
    }
  }

  Object.keys(adConfig).forEach((adNetwork) => {
    const config = adConfig[adNetwork];
    let settingNames = null,
      name;

    if (
      _isNetworkAvailable(siteSettings, config.enabledSetting) &&
      _shouldPlaceAdInSlot(siteSettings, postNumber, config.nthPost)
    ) {
      if (site.mobileView) {
        settingNames = config.mobile || config.desktop;
      } else {
        settingNames = config.desktop;
      }

      if (settingNames) {
        name = settingNames[placement];
      }

      if (name === undefined) {
        // follows naming convention: prefix_(mobile_)_{placement}_code
        name = `${config.settingPrefix}_${
          site.mobileView ? "mobile_" : ""
        }${placeUnderscored}_code`;
      }

      if (
        name !== false &&
        siteSettings[name] !== false &&
        !isBlank(siteSettings[name])
      ) {
        types.push(adNetwork);
      }
    }
  });

  return types;
}

export default AdComponent.extend({
  needsUpdate: false,
  tagName: "",

  /**
   * For a given ad placement and optionally a post number if in between posts,
   * list all ad network names that are configured to show there.
   */
  @discourseComputed("placement", "postNumber", "indexNumber")
  availableAdTypes(placement, postNumber, indexNumber) {
    return slotContenders(
      this.site,
      this.siteSettings,
      placement,
      indexNumber,
      postNumber
    );
  },

  /**
   * When house ads are configured to alternate with other ad networks, we
   * need to trigger an update of which ad component is shown after
   * navigating between topic lists or topics.
   */
  @observes("refreshOnChange")
  changed() {
    if (this.get("listLoading")) {
      return;
    }

    // force adComponents to be recomputed
    this.notifyPropertyChange("needsUpdate");
  },

  /**
   * Returns a list of the names of ad components that should be rendered
   * in the given ad placement. It handles alternating between house ads
   * and other ad networks.
   */
  @discourseComputed("placement", "availableAdTypes", "needsUpdate")
  adComponents(placement, availableAdTypes) {
    if (
      !availableAdTypes.includes("house-ad") ||
      availableAdTypes.length === 1
    ) {
      // Current behaviour is to allow multiple ads from different networks
      // to show in the same place. We could change this to choose one somehow.
      return availableAdTypes;
    }

    const houseAds = this.site.get("house_creatives");
    let houseAdsSkipped = false;

    if (houseAds.settings.house_ads_frequency === 100) {
      // house always wins
      return ["house-ad"];
    } else if (houseAds.settings.house_ads_frequency > 0) {
      // show house ads the given percent of the time
      if (
        displayCounts.allAds === 0 ||
        (100 * displayCounts.houseAds) / displayCounts.allAds <
          houseAds.settings.house_ads_frequency
      ) {
        displayCounts.houseAds += 1;
        displayCounts.allAds += 1;
        return ["house-ad"];
      } else {
        houseAdsSkipped = true;
      }
    }

    const networkNames = availableAdTypes.filter((x) => x !== "house-ad");

    if (houseAdsSkipped) {
      displayCounts.allAds += networkNames.length;
    }

    return networkNames;
  },
});


    const currentUser = Discourse.User.current();
    var valueExists = true;
    console.log(valueExists);

    if(valueExists==true){
  
    setTimeout(function() {
      $(".video_section").html('');   
      $('<div class="video_section"><script src="https://player.ex.co/player/ace0fe48-0bdb-4202-b78c-dafca2c16291"></div></div>').insertAfter(".side-ad-outlet.discourse-adplugin");
    }, 1000);   
  }
