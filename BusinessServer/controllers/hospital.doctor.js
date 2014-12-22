var Errors = require('../lib/Errors');

exports.working = require('./hospital.doctor.working');

exports.list = function(req, res, next) {
    var hospitalId = req.query.hospitalId;
    var date = req.query.date;
    var period = req.query.period == 'morning' ? 1 : (req.query.period == 'afternoon' ? 2 : 3);
    var count = 1;
    var ret = {};
    req.db.driver.execQuery(
        "SELECT doctor.id as id, doctor.name as name, hospital.name as hospital, department.name as department, " +
        "doctor.title as title, doctor.info as description, doctor.photo as photo_url, department.id as department_id, " +
        "doctor.price as price FROM doctor, department, hospital WHERE doctor.department_id = department.id " +
        "AND department.hospital_id = hospital.id AND hospital.id = ?",
        [hospitalId],
        function(err, data) {
            if(err) throw err;
            count = data.length;
            if(typeof date != 'undefined') {
                date = new Date(date);
                var day = (date.getDay()+6)%7+1;
                var freq = '2_______'.replaceAt(day, '1');
                if(typeof period != 'undefined') {
                    data.forEach(function(line) {
                        req.db.driver.execQuery(
                            "SELECT working.* FROM doctor, working WHERE doctor.id = working.doctor_id AND doctor.id = ? " +
                            "AND working.period = ? AND (working.frequency LIKE ? "+
                            "OR (working.date = ? AND working.frequency LIKE '0%'))",
                            [line.id, period, freq, req.query.date],
                            function(err, d) {
                                if(err) throw err;
                                if(d.length > 0) {
                                    if(!Array.isArray(ret[line.department_id])) {
                                        ret[line.department_id] = [];
                                    }
                                    ret[line.department_id].push(line);
                                }
                                finish();
                            }
                        );
                    });
                } else {
                    data.forEach(function(line) {
                        req.db.driver.execQuery(
                            "SELECT working.* FROM doctor, working WHERE doctor.id = working.doctor_id AND doctor.id = ? " +
                            "AND (working.frequency LIKE ? OR (working.date = ? AND working.frequency LIKE '0%'))",
                            [line.id, period, req.query.date, freq],
                            function(err, data) {
                                if(err) throw err;
                                if(date.length > 0) {
                                    if(!Array.isArray(ret[line.department_id])) {
                                        ret[line.department_id] = [];
                                    }
                                    ret[line.department_id].push(line);
                                }
                                finish();
                            }
                        );
                    });
                }
            } else {
                count = 1;
                data.forEach(function(line) {
                    if (!Array.isArray(ret[line.department_id])) {
                        ret[line.department_id] = [];
                    }
                    ret[line.department_id].push(line);
                });
                finish();
            }
        }
    );
    function finish() {
        if(--count === 0) {
            res.json({
                code: 0,
                message: 'success',
                doctors: ret
            });
        }
    }
};

exports.add = function(req, res, next) {
    req.models.department.get(req.body.departmentId, function(err, department) {
        if(err && err.message != 'Not found') return next(err);
        if(!department) return next(new Errors.DepartmentNotExist("Department with id %s not exist", req.body.departmentId));
        req.models.doctor.create({
            name: req.body.name,
            photo: req.body.photo,
            info: req.body.description,
            title: req.body.title,
            price: req.body.price,
            department_id: department.id
        }, function(err, doctor) {
            if(err) throw err;
            res.json({
                code: 0,
                message: 'success',
                doctor_id: doctor.id
            });
        });
    });
};

exports.remove = function(req, res, next) {
    req.models.doctor.get(req.params.doctorId, function(err, doctor) {
        if(err && err.message != 'Not found') throw err;
        if(!doctor) return next(new Errors.DoctorNotExist('Doctor Not Exist'));
        doctor.remove(function(err) {
            if(err) throw err;
            res.json({
                code: 0,
                message: 'success'
            });
        });
    });
};

exports.update = function(req, res, next) {
    req.models.doctor.get(req.params.doctorId, function(err, doctor) {
        if(err && err.message != 'Not found') {
            res.send(500, "Internal error");
            throw err;
        }
        if(!doctor) {
            res.send(500, "Doctor not exist.");
            throw err;
        }
        if(typeof req.body.department_id != 'undefined') {
            var department_id = req.body.department_id;
            req.models.department.get(department_id, function(err, department) {
                if(err && err.message != 'Not found') throw err;
                doctor.setDepartment(department, function(err) {
                    if(err && err.message != 'Not found') throw err;
                });
            });
        }
        for(var index in req.body) {
            switch(index) {
                case 'name':
                    doctor.name = req.body[index];
                    break;
                case 'description':
                    doctor.info = req.body[index];
                    break;
                case 'price':
                    doctor.price = req.body[index];
                    break;
                case 'title':
                    doctor.title = req.body[index];
                    break;
                default:
                    break;
            }
        }
        doctor.save(function(err) {
            if(err) {
                res.send(500, "Internal error");
                throw err;
            }
            res.json({
                code: 0,
                message: 'success'
            });
        });
    });
};

exports.detail = function(req, res, next) {
    req.models.doctor.get(req.params.doctorId, function(err, doctor) {
        if(err && err.message != 'Not found') throw err;
        if(!doctor) return next(new Errors.DoctorNotExist('Doctor Not Exist'));
        doctor.getWorking(function(err, workings) {
            if(err) throw err;
            var curDate = new Date();
            var year = curDate.getFullYear();
            var month = curDate.getMonth();
            var date = curDate.getDate() + 1;
            var day = (curDate.getDay()+6)%7+1;
            var dd = new Date();
            var slot = [];
            var hasTemp=[{morning: 0, afternoon: 0,evening: 0},{morning: 0, afternoon: 0,evening: 0},{morning: 0, afternoon: 0,evening: 0},
                        {morning: 0, afternoon: 0,evening: 0},{morning: 0, afternoon: 0,evening: 0},{morning: 0, afternoon: 0,evening: 0},
                        {morning: 0, afternoon: 0,evening: 0}];
            for(var i = 0; i < 7; i++) {
                slot.push({
                    date: {
                        year: year,
                        month: month + 1,
                        date: dd.nextDay().getDate(),
                        day: (function() {
                            switch(dd.getDay()) {
                                case 1:
                                    return '星期一';
                                case 2:
                                    return '星期二';
                                case 3:
                                    return '星期三';
                                case 4:
                                    return '星期四';
                                case 5:
                                    return '星期五';
                                case 6:
                                    return '星期六';
                                case 0:
                                    return '星期日';
                            }
                        })()
                    },
                    slot: {
                        morning: [false, 0, 0],
                        afternoon: [false, 0, 0],
                        evening: [false, 0, 0]
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
                            slot[i].slot[key][0] = (working.frequency.charAt(1) == '1');
                            slot[i].slot[key][1] =working.monday;
                            hasTemp[i][key] = 1;
                        }
                        break;
                    case '1':
                        slot.forEach(function(s) {
                            s.slot[key][0] = true;
                        });
                        break;
                    case '2':
                        function getApp(working,day){
                            switch(day){
                                case 1:
                                    return working.monday;
                                    break;
                                case 2:
                                    return working.tuesday;
                                    break;
                                case 3:
                                    return working.wednesday;
                                    break;
                                case 4:
                                    return working.thursday;
                                    break;
                                case 5:
                                    return working.friday;
                                    break;
                                case 6:
                                    return working.saturday;
                                    break;
                                case 7:
                                    return working.sunday;
                                    break;
                            }
                        }
                        for(var j=1; j <= 7; j++) {
                            if(working.frequency.charAt(j) == '1'&&hasTemp[(6-day+j)%7][key] == 0) {
                                slot[(6-day+j)%7].slot[key][0] = true;
                                var app;
                                slot[(6-day+j)%7].slot[key][1] = getApp(working, (6-day+j)%7+1);
                            }
                        }
                        break;
                    case '3':
                        var i = tarDate.getDate() - date;
                        if(i < 7 && i >= 0) {
                            slot[i].slot[key][0] = true;
                        }
                        break;
                }
            });
            var startdate=slot[0].date.year+'-'+slot[0].date.month+'-'+slot[0].date.date;
            var enddate=slot[6].date.year+'-'+slot[6].date.month+'-'+slot[6].date.date;
            req.db.driver.execQuery("SELECT period as period, (DAYOFWEEK(time)+6)%7 as day, count(user_id) as appnum "+
            "FROM appointment "+
            "WHERE doctor_id=? "+
            "AND time>=? AND time<=? "+
            "GROUP BY period,time "+
            "ORDER BY time",
            [req.params.doctorId, startdate, enddate], function(err, datas) {
                    if(err && err.message != 'Not found') {
                        res.send(500, "Internal error");
                        throw err;
                    }
                    if(datas && datas.length > 0){
                        var today=(new Date().getDay()+6)%7+1;
                        datas.forEach(function(adata){
                            slot[(6-today+adata.day)%7].slot[adata.period==1? 'morning': (adata.period==2 ? 'afternoon' : 'evening')][2] =adata.appnum;
                        });
                    }
                    doctor.getDepartment(function(err, department) {
                        if(err) throw err;
                        department.getHospital(function(err, hospital) {
                            if(err) throw err;
                            res.json({
                                code: 0,
                                message: 'success',
                                id: doctor.id,
                                name: doctor.name,
                                hospital: hospital.name,
                                department: department.name,
                                title: doctor.title,
                                description: doctor.info,
                                photo_url: doctor.photo,
                                time_slots: slot,
                                price: doctor.price
                            });
                        });
                    });
            });
        });
    });
};