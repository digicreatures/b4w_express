

// register the application module
b4w.register("b4w_express", function(exports, require) {

var m = {
  app: require("app"),
  config: require("config"),
  version: require("version"),
  data: require("data"),
  scenes: require("scenes"),
  anim: require("animation"),
  sfx: require("sfx"),
  time: require("time"),
  preloader: require("preloader"),
  cam: b4w.require("camera"),
  ctr: b4w.require("constraints"),
  vec3: b4w.require("vec3"),
  quat: b4w.require("quat"),
  trans: b4w.require("transform"),
}

// detect application mode
var DEBUG = (m.version.type() == "DEBUG");

// automatically detect assets path
var APP_ASSETS_PATH = m.config.get_assets_path("b4w_express");

/**
 * export the method to initialize the app (called at the bottom of this file)
 */
exports.init = function() {
    m.app.init({
        canvas_container_id: "b4w_express_canvas",
        callback: init_cb,
        show_fps: DEBUG,
        console_verbose: DEBUG,
        autoresize: true
    });
}

/**
 * callback executed when the app is initialized
 */
function init_cb(canvas_elem, success) {

    if (!success) {
        console.log("b4w init failure");
        return;
    }

    m.preloader.create_preloader();

    // ignore right-click on the canvas element
    canvas_elem.oncontextmenu = function(e) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    };

    load();
}

/**
 * load the scene data
 */
function load() {
    m.data.load(APP_ASSETS_PATH + "b4w_express.json", load_cb, preloader_cb);
}

/**
 * update the app's preloader
 */
function preloader_cb(percentage) {
    m.preloader.update_preloader(percentage);
}

/**
 * callback executed when the scene data is loaded
 */
function load_cb(data_id, success) {

    if (!success) {
        console.log("b4w load failure");
        return;
    }

    m.app.enable_camera_controls();

    var railway = new Railway();
    var train = new Train(railway.next_section.bind(railway));
    train.set_position(1,.39);
    train.set_speed(0);

    exports.train = train;
    exports.switch_railway_section = railway.switch_section.bind(railway);
}

function Railway() {

  function RailwayPoint(from, tos) {
    var current = 0;

    this.switch_section = function() {
      current = (current + 1) % tos.length;
    }

    this.get_next_section = function(from_section) {
      if (from_section == from) {
        return tos[current];
      }
      return from;
    }
  }

  var railwayPoints = [new RailwayPoint(0, [1, 2]), new RailwayPoint(0, [1, 2])];
  var railwaySections = [
    [railwayPoints[0], railwayPoints[1]],
    [railwayPoints[1], railwayPoints[0]],
    [railwayPoints[1], railwayPoints[0]],
  ];

  this.next_section = function(from_section, direction) {
    return railwaySections[from_section][direction > 0 ? 1 : 0].get_next_section(from_section);
  }

  this.switch_section = function() {
    railwayPoints[0].switch_section();
    railwayPoints[1].switch_section();
  }
}

function Train(next_section_callback) {
  this.speed = 0;

  var armature = m.scenes.get_object_by_name("loco.armature");
  var wheel_speaker = m.scenes.get_object_by_name("loco.wheel.speaker");

  this.blow_horn = function() {
    var horn_speaker = m.scenes.get_object_by_name("loco.horn.speaker");
    if (!m.sfx.is_playing(horn_speaker)) {
      m.sfx.play(horn_speaker);
    }
  }

  this.accelerate_to = function(speed) {
    if (this.speed != speed) {
      if (this.accelerate_animation_id) {
        m.time.clear_animation(this.accelerate_animation_id);
        this.accelerate_animation_id = undefined;
      }
      var period = Math.abs(this.speed - speed) * 500;
      this.accelerate_animation_id = m.time.animate(this.speed, speed, period, this.set_speed.bind(this));
    }
  }

  this.stop = function() {
    this.accelerate_to(0);
  }

  this.set_position = function(section, offset) {
    m.anim.apply(armature, "path.section." + section, m.anim.SLOT_0);
    if (this.speed != 0) {
      m.anim.set_speed(armature, this.speed, m.anim.SLOT_0);
      m.anim.play(armature, this.on_railway_section_ends.bind(this), m.anim.SLOT_0);
    }
    m.anim.set_frame(armature, Math.floor((m.anim.get_anim_length(armature, m.anim.SLOT_0))*offset +1), m.anim.SLOT_0);
  }

  this.on_railway_section_ends = function (obj, slot){
    var anim_name = m.anim.get_current_anim_name(obj, slot);
    if (anim_name.startsWith("path.section.")) {
      var section = parseInt(anim_name.slice(13));
      var next_section = next_section_callback(section, this.speed);

      this.set_position(next_section, this.speed >= 0 ? 0 : 1);
    }
  }

  this.set_speed = function(speed) {
    this.speed = speed;
    if (this.speed == 0) {
      if (m.anim.is_play(armature)) {
        m.anim.stop(armature, m.anim.SLOT_ALL);
        m.sfx.stop(wheel_speaker);
      }
      m.scenes.set_wind_params({ wind_strength: 0 });
    } else {
      m.anim.set_speed(armature, this.speed, m.anim.SLOT_ALL);
      m.sfx.playrate(wheel_speaker, Math.max(.8, 1 + Math.log(Math.abs(this.speed))))
      m.scenes.set_wind_params({ wind_strength: this.speed * .05 });
      if (!m.anim.is_play(armature)) {
        m.anim.play(armature, null, m.anim.SLOT_ALL);
        m.anim.play(armature, this.on_railway_section_ends.bind(this), m.anim.SLOT_0);
        m.sfx.play(wheel_speaker);
      }
    }
  }

  m.anim.apply(armature, "path.section.1", m.anim.SLOT_0);
  m.anim.set_behavior(armature, m.anim.AB_FINISH_STOP, m.anim.SLOT_0);
  m.anim.apply(armature, "loco.wheel.action", m.anim.SLOT_1);
  m.anim.set_behavior(armature, m.anim.AB_CYCLIC, m.anim.SLOT_1);
}

exports.switch_view = function () {
  var c = m.scenes.get_active_camera();
  m.ctr.remove(c);

  switch (this.view) {
    case "train":
      this.view = "main";
      m.cam.target_setup(c, {pos: m.trans.get_translation(m.scenes.get_object_by_name("position.camera.main")), pivot: new Float32Array([.0, -88, .0]), use_panning: true});
      break;
    case "follow":
      this.view = "train";
      m.cam.static_setup(c);
      m.ctr.append_stiff(c, m.scenes.get_object_by_name("loco.armature"), new Float32Array([-9.0136795, -5.4297924, 3.0844262]), m.quat.fromValues(0.5750986, -0.3804992, -0.3996153, 0.603978));
      break;
    default:
      this.view = "follow";
      /*
      m.cam.eye_setup(c, {pos: m.trans.get_translation(m.scenes.get_object_by_name("position.camera.follow"))})
      m.ctr.append_follow(c, m.scenes.get_object_by_name("loco.armature"), 10, 100);
      //m.ctr.append_semi_soft(c, m.scenes.get_object_by_name("loco.armature"), new Float32Array([-15,-16,10]));
      m.cam.correct_up(c, m.vec3.set(0,1,0, m.vec3.create()), true);
      */
      m.cam.static_setup(c);
      m.ctr.append_stiff(c, m.scenes.get_object_by_name("loco.armature"), new Float32Array([14.9537058, -8.2358027, 7.0147314]), m.quat.fromValues(0.5148795, 0.2886761, 0.3947535, 0.7040845));
      break;
  }
}

});

// import the app module and start the app by calling the init method
var b4w_express = b4w.require("b4w_express");
b4w_express.init();
