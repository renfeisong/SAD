var Errors = require('../lib/Errors');

exports.list = function(req, res, next) {
    var hospitalId = req.query.hospitalId;
    req.models.hospital.get(hospitalId, function(err, hospital) {
        if(err) return next(err);
        if(!hospital) return next(new Errors.HospitalNotExist("Department Not Exist"));
        var ret = {};
        hospital.getDepartment(function(err, department) {
            if(err) return next(err);
            department.getDoctors(function(err, doctors) {
                doctors.forEach(function(doctor) {
                    if(!Array.isArray(ret[department.name])) {
                        ret[department.name] = [];
                    }
                    ret[department.name].push({
                        id: doctor.id,
                        name: doctor.name,
                        hospital: hospital.name,
                        department: department.name,
                        title: doctor.title,
                        description: doctor.info,
                        photo_url: doctor.photo
                    });
                });
            });
        });
        res.json({
            errcode: 0,
            errmsg: 'success',
            doctors: ret
        });
    });
};

exports.add = function(req, res, next) {
    req.models.department.get(req.body.departmentId, function(err, department) {
        req.models.doctor.create({
            name: req.body.name,
            photo: req.body.photo,
            info: req.body.description,
            title: req.body.title
        }, function(err, doctor) {
            if(err) return next(err);
            doctor.setDepartment(department, function(err) {
                if(err) return next(err);
                res.json({
                    errcode: 0,
                    errmsg: 'success',
                    doctor_id: doctor.id
                });
            });
        });
    });
};

exports.remove = function(req, res, next) {
    req.models.doctor.get(req.params.doctorId, function(err, doctor) {
        if(err) return next(err);
        if(!doctor) return next(new Errors.DoctorNotExist('Doctor Not Exist'));
        doctor.remove(function(err) {
            if(err) return next(err);
            res.json({
                errcode: 0,
                errmsg: 'success'
            });
        });
    });
};

exports.update = function(req, res, next) {
    req.models.doctor.get(req.params.doctorId, function(err, doctor) {
        if(err) return next(err);
        if(!doctor) return next(new Errors.DoctorNotExist('Doctor Not Exist'));
        for(var index in req.body) {
            doctor[index] = req.body[index];
        }
        doctor.save(function(err) {
            if(err) return next(err);
            res.json({
                errcode: 0,
                errmsg: 'success'
            });
        });
    });
};

exports.detail = function(req, res, next) {
    req.models.doctor.get(req.params.doctorId, function(err, doctor) {
        if(err) return next(err);
        if(!doctor) return next(new Errors.DoctorNotExist('Doctor Not Exist'));
        doctor.getWorking(function(err, workings) {
            if(err) return next(err);
            var curDate = new Date();
            var year = curDate.getFullYear();
            var month = curDate.getMonth();
            var date = curDate.getDate() + 1;
            var day = curDate.getDay();
            var dd = new Date();
            var slot = [];
            for(var i = 0; i < 7; i++) {
                slot.push({
                    date: {
                        year: year,
                        month: month,
                        date: date,
                        day: dd.nextDay().getDate()
                    },
                    slot: {
                        morning: false,
                        afternoon: false,
                        evening: false
                    }
                });
            }
            workings.forEach(function(working) {
                var tarDate = new Date(working.date);
                var key;
                switch(working.period) {
                    case 1:
                        key = 'morning';
                        break;
                    case 2:
                        key = 'afternoon';
                        break;
                    case 3:
                        key = 'evening';
                        break;
                }
                switch(working.frequency.charAt(0)) {
                    case '0':
                        var i = curDate.getDateOffset(tarDate);
                        if(i <= 7 && i > 0) {
                            slot[i].slot[key] = true;
                        }
                        break;
                    case '1':
                        slot.forEach(function(s) {
                            s.slot[key] = true;
                        });
                        break;
                    case '2':
                        for(var j=0; j < 7; j++) {
                            if(working.frequency.charAt(j) == '1') {
                                slot[j+day<=6?j+day:j+day-7][key] = true;
                            }
                        }
                        break;
                    case '3':
                        var i = tarDate.getDate() - date;
                        if(i < 7 && i >= 0) {
                            slot[i].slot[key] = true;
                        }
                        break;
                }
            });
            res.json({
                id: doctor.id,
                name: doctor.name,
                hospital: doctor.department.hospital.name,
                department: doctor.department.name,
                title: doctor.title,
                description: doctor.info,
                photo_url: doctor.photo,
                time_slots: slot,
                price: doctor.price
            });
        });
    });
};